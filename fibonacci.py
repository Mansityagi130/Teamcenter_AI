from mcp.server.fastmcp import FastMCP

mcp = FastMCP("test_mcp")

@mcp.tool()
def add(a: int, b: int) -> int:
    return a + b

@mcp.tool()
def subtract(a: int, b: int) -> int:
    return a - b

@mcp.tool()
def fibonacci(n: int) -> int:
    a, b = 0, 1

    for _ in range(n):
        a, b = b, a + b

    return a

if __name__ == "__main__":
    mcp.run()