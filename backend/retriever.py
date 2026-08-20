import asyncio
import os
import logging

# Prevent transformers from importing TensorFlow (avoids Keras 3 compatibility crash)
os.environ["TRANSFORMERS_NO_TF"] = "1"

from dotenv import load_dotenv

load_dotenv()

# Configure module-level logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

from qdrant_client import AsyncQdrantClient, QdrantClient
from llama_index.core import Settings, VectorStoreIndex
from llama_index.vector_stores.qdrant import QdrantVectorStore
from llama_index.embeddings.huggingface_api import HuggingFaceInferenceAPIEmbedding

def get_index():
    # Configure the embedding model globally using HF Inference API
    Settings.embed_model = HuggingFaceInferenceAPIEmbedding(
        model_name="BAAI/bge-m3",
        token=os.getenv("HF_TOKEN")
    )

    qdrant_url = os.getenv("QDRANT_URL")
    qdrant_api_key = os.getenv("QDRANT_API_KEY")

    # Sync client — used by QdrantVectorStore for index/collection management
    qdrant_client = QdrantClient(
        url=qdrant_url,
        api_key=qdrant_api_key,
    )

    # Async client — required by QdrantVectorStore.aretrieve() inside FastAPI's event loop
    qdrant_aclient = AsyncQdrantClient(
        url=qdrant_url,
        api_key=qdrant_api_key,
    )

    # Initialize the vector store with BOTH clients for sync + async support
    vector_store = QdrantVectorStore(
        client=qdrant_client,
        aclient=qdrant_aclient,                      # Required for await aretrieve()
        collection_name="finrag_assistant_v2",
        enable_hybrid=True,                          # Dense + sparse BM25 fusion
        fastembed_sparse_model="Qdrant/bm25",        # Requires: pip install fastembed
    )
    return VectorStoreIndex.from_vector_store(vector_store=vector_store)


async def retrieve_financial_context(query: str) -> str:
    """Retrieve the top 5 most relevant financial document chunks for a given query.

    Uses a token-optimized top_k=5 to prevent context bloat while fully leveraging
    the reasoning capabilities of Llama-3.3-70b. Includes a 3-attempt retry loop
    to handle HuggingFace Inference API cold start / 504 timeouts.

    Args:
        query: The user's financial question or search query.

    Returns:
        A single string of the top-5 retrieved nodes, concatenated with separators and sources.
    """
    retriever = get_index().as_retriever(similarity_top_k=5)

    max_attempts = 3
    last_exception = None
    for attempt in range(1, max_attempts + 1):
        try:
            logger.info(f"Retrieval attempt {attempt}/{max_attempts} for query: '{query[:60]}...'")
            nodes = await retriever.aretrieve(query)
            break  # Success — exit the retry loop
        except Exception as e:
            last_exception = e
            if attempt < max_attempts:
                logger.warning(
                    f"Hugging Face API cold start or timeout detected (attempt {attempt}/{max_attempts}). "
                    f"Waiting 20 seconds before retrying... Error: {e}"
                )
                await asyncio.sleep(20)
            else:
                logger.error(f"All {max_attempts} retrieval attempts failed. Raising final exception.")
                raise last_exception

    context_parts = []
    for node in nodes:
        source = node.metadata.get("file_name") or node.metadata.get("file_path") or "Financial Report"
        if "/" in str(source):
            source = str(source).split("/")[-1]
        
        content = node.get_content().strip()
        context_parts.append(f"---\nSource: [{source}]\nContent: {content}\n---")

    return "\n\n".join(context_parts)
