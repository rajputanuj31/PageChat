import hashlib
import os
from typing import Optional

import certifi
import requests
from dotenv import load_dotenv

from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_pinecone import PineconeVectorStore
from pinecone import Pinecone
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import (
    RunnableLambda,
    RunnableParallel,
    RunnablePassthrough,
)
from langchain_core.output_parsers import StrOutputParser
from langchain_community.document_loaders import WebBaseLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter


load_dotenv()

PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")

EMBEDDING_MODEL = "text-embedding-3-small"
CHAT_MODEL = "gpt-4.1-mini"
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
TOP_K = 4
TEMPERATURE = 0.2


def _format_docs(docs) -> str:
    return "\n\n".join(doc.page_content for doc in docs)


def _url_namespace(url: str) -> str:
    """Stable 40-char namespace derived from the URL so each page is isolated."""
    return hashlib.sha1(url.encode()).hexdigest()


def build_chain(url: str, api_key: Optional[str] = None):
    namespace = _url_namespace(url)

    embeddings = OpenAIEmbeddings(
        model=EMBEDDING_MODEL,
        api_key=api_key,
    )

    pc = Pinecone(api_key=PINECONE_API_KEY)
    index = pc.Index("pagechat")

    # Check if this page has already been indexed by looking for existing vectors.
    stats = index.describe_index_stats()
    already_indexed = namespace in (stats.namespaces or {})

    vector_store = PineconeVectorStore(
        index=index,
        embedding=embeddings,
        namespace=namespace,
    )

    if not already_indexed:
        session = requests.Session()
        session.verify = certifi.where()
        loader = WebBaseLoader(url, session=session)
        docs = loader.load()

        if not docs:
            raise ValueError("No content found at the given URL.")

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
        )
        chunks = splitter.split_documents(docs)
        vector_store.add_documents(chunks)

    retriever = vector_store.as_retriever(
        search_type="similarity",
        search_kwargs={"k": TOP_K},
    )

    prompt = PromptTemplate(
        template=(
            "You are a helpful assistant.\n\n"
            "Use ONLY the information provided in the context below.\n"
            "If the answer is not present, say 'I don't know.'\n\n"
            "Context:\n"
            "{context}\n\n"
            "Question:\n"
            "{question}\n"
        ),
        input_variables=["context", "question"],
    )

    parallel_chain = RunnableParallel(
        context=retriever | RunnableLambda(_format_docs),
        question=RunnablePassthrough(),
    )

    llm = ChatOpenAI(
        model=CHAT_MODEL,
        temperature=TEMPERATURE,
        api_key=api_key,
        streaming=True,
    )
    parser = StrOutputParser()

    return parallel_chain | prompt | llm | parser



