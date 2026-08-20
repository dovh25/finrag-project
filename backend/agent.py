import json
import logging
import os
from typing import Literal, TypedDict

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq
from langgraph.graph import END, START, StateGraph

from retriever import retrieve_financial_context

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# LLM factory
# ---------------------------------------------------------------------------

def get_llm():
    return ChatGroq(
        temperature=0,
        model_name="llama-3.3-70b-versatile",
        api_key=os.getenv("GROQ_API_KEY"),
    )


# ---------------------------------------------------------------------------
# Graph State
# ---------------------------------------------------------------------------

class GraphState(TypedDict):
    query: str
    chat_history: list
    context: str
    response: str
    grade: str        # "yes" | "no" — output of retrieval_grader_node
    retry_count: int  # number of grader-triggered retries (capped at 1)


# ---------------------------------------------------------------------------
# Node: retrieve_node
# ---------------------------------------------------------------------------

async def retrieve_node(state: GraphState) -> dict:
    """Retrieve relevant financial context for the user's query via hybrid search."""
    logger.info(f"[retrieve_node] Fetching context (retry_count={state.get('retry_count', 0)})")
    context = await retrieve_financial_context(state["query"])
    return {"context": context}


# ---------------------------------------------------------------------------
# Node: retrieval_grader_node
# ---------------------------------------------------------------------------

async def retrieval_grader_node(state: GraphState) -> dict:
    """Use the LLM to score whether the retrieved context is relevant to the query.

    Returns grade='yes' if the context is useful, 'no' otherwise.
    Increments retry_count on a 'no' grade so the router can enforce a max-1-retry cap.
    """
    grader_prompt = (
        "You are a strict relevance grader. Your sole job is to decide whether the retrieved "
        "financial context contains information that can help answer the user's question.\n\n"
        f"User Question: {state['query']}\n\n"
        f"Retrieved Context (first 800 chars):\n{state['context'][:800]}\n\n"
        "Does the context contain relevant data to answer the question?\n"
        'Respond with ONLY this JSON object, no explanation: {"score": "yes"} or {"score": "no"}'
    )

    result = await get_llm().ainvoke([HumanMessage(content=grader_prompt)])

    # Robust JSON parse with plain-text fallback
    try:
        data = json.loads(result.content.strip())
        grade = str(data.get("score", "yes")).lower()
    except (json.JSONDecodeError, AttributeError):
        content_lower = result.content.lower()
        grade = "no" if ("no" in content_lower and "yes" not in content_lower) else "yes"

    # Track retry attempts: increment when grade is "no"
    retry_count = state.get("retry_count", 0)
    if grade == "no":
        retry_count += 1

    logger.info(f"[retrieval_grader_node] grade='{grade}' | retry_count={retry_count}")
    return {"grade": grade, "retry_count": retry_count}


# ---------------------------------------------------------------------------
# Conditional Edge: route_after_grading
# ---------------------------------------------------------------------------

def route_after_grading(
    state: GraphState,
) -> Literal["generate_node", "retrieve_node", "fallback_node"]:
    """Route the graph based on the grader's verdict and retry budget.

    Flow:
        grade="yes"               → generate_node  (context is relevant, proceed)
        grade="no", retry_count≤1 → retrieve_node  (one free retry allowed)
        grade="no", retry_count>1 → fallback_node  (budget exhausted, graceful exit)
    """
    grade = state.get("grade", "yes")
    retry_count = state.get("retry_count", 0)

    if grade == "yes":
        logger.info("Routing → generate_node (context is relevant)")
        return "generate_node"
    elif retry_count <= 1:
        logger.info(f"Routing → retrieve_node (retry attempt {retry_count}/1)")
        return "retrieve_node"
    else:
        logger.info("Routing → fallback_node (context irrelevant after max retries)")
        return "fallback_node"


# ---------------------------------------------------------------------------
# Node: fallback_node
# ---------------------------------------------------------------------------

def fallback_node(state: GraphState) -> dict:
    """Return a structured fallback response when the grader rejects context after max retries."""
    logger.warning(f"[fallback_node] Returning fallback for query: '{state['query'][:80]}'")
    return {
        "response": (
            "⚠️ I was unable to find sufficiently relevant information in the 2025 Annual Reports "
            "to accurately answer your question after multiple retrieval attempts.\n\n"
            "Please try rephrasing your question, or ask about a specific company — "
            "**Vinamilk**, **MB Bank**, **Hoa Phat**, **FPT**, or **Vingroup** — "
            "and their 2025 annual report data."
        )
    }


# ---------------------------------------------------------------------------
# Node: generate_node
# ---------------------------------------------------------------------------

async def generate_node(state: GraphState) -> dict:
    """Generate an analytical response using the retrieved and graded context."""
    system_prompt = (
        "You are a Senior Corporate & Financial Analyst expert in Top Vietnamese Corporations. "
        "You have access to context extracted from the 2025 Annual Reports of 5 specific companies: "
        "Vinamilk, MB Bank, Hoa Phat, FPT, and Vingroup. "
        "Analyze the following context from their annual reports and answer the user's question with precision, clarity, and professional insight. "
        "You also have access to the chat history to understand the conversational context (e.g., if the user asks a follow-up question without naming the company, refer to the previous messages). "
        "Always base your answers strictly on the retrieved context. If the data is not in the context, strictly say 'I don't know' or 'The provided context does not contain this information.' "
        "STRICT CITATION RULE: You MUST append a citation badge at the end of ANY sentence containing specific numerical data, strategic claims, or facts. "
        "Format the citation exactly like this, using the source name provided in the context, enclosed in backticks and brackets: `[Source: Filename.pdf]`.\n\n"
        f"### Annual Report Context:\n{state['context']}"
    )

    messages = [SystemMessage(content=system_prompt)]

    # --- Sliding Window Memory (K=4): only use the last 4 messages to prevent token overflow ---
    K = 4
    recent_history = state.get("chat_history", [])[-K:]
    for msg in recent_history:
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["content"]))
        else:
            messages.append(AIMessage(content=msg["content"]))

    # Append current query
    messages.append(HumanMessage(content=state["query"]))

    result = await get_llm().ainvoke(messages)
    return {"response": result.content}


# ---------------------------------------------------------------------------
# Build & compile the LangGraph StateGraph
#
# Flow:
#   START
#     └─► retrieve_node
#               └─► retrieval_grader_node
#                         ├─ "yes"      ──────────────────► generate_node ──► END
#                         ├─ "no" (retry≤1) ──► retrieve_node (loop back)
#                         └─ "no" (retry>1)  ──► fallback_node ──────────► END
# ---------------------------------------------------------------------------

workflow = StateGraph(GraphState)

workflow.add_node("retrieve_node", retrieve_node)
workflow.add_node("retrieval_grader_node", retrieval_grader_node)
workflow.add_node("generate_node", generate_node)
workflow.add_node("fallback_node", fallback_node)

workflow.add_edge(START, "retrieve_node")
workflow.add_edge("retrieve_node", "retrieval_grader_node")
workflow.add_conditional_edges(
    "retrieval_grader_node",
    route_after_grading,
    {
        "generate_node": "generate_node",
        "retrieve_node": "retrieve_node",   # loop back for one free retry
        "fallback_node": "fallback_node",
    },
)
workflow.add_edge("generate_node", END)
workflow.add_edge("fallback_node", END)

graph = workflow.compile()
