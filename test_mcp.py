from mcp.server.fastmcp import FastMCP
import requests
from dotenv import load_dotenv
import os
load_dotenv()
BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")
BACKEND_API_KEY = os.getenv("BACKEND_API_KEY", "")
mcp=FastMCP()


def backend_headers():
    if not BACKEND_API_KEY:
        return {}
    return {"X-API-Key": BACKEND_API_KEY}


def backend_json(response):
    response.raise_for_status()
    return response.json()

@mcp.tool()
def health_check():
    '''Checks the health of the backend service.'''
    response = requests.get(f"{BACKEND_URL}/health")
    return backend_json(response)
@mcp.tool()
def search_item(item_id: str):    
    '''Searches for an item by its ID.'''
    response = requests.post(f"{BACKEND_URL}/item/search", json={"item_id": item_id}, headers=backend_headers())
    return backend_json(response)
@mcp.tool()
def add_item(item_id: str):    
    '''Adds a new item.'''
    response = requests.post(f"{BACKEND_URL}/item/add", json={"item_id": item_id}, headers=backend_headers())
    return backend_json(response)
@mcp.tool()
def list_items():    
    '''Lists all items.'''
    response = requests.post(f"{BACKEND_URL}/item/list", headers=backend_headers())
    return backend_json(response)

if __name__ == "__main__":
    mcp.run()
