import os

# 屏蔽 milvus-lite gRPC 的 keepalive 噪音日志
# 必须在任何 gRPC/pymilvus 模块导入之前设置
os.environ.setdefault("GRPC_VERBOSITY", "error")
os.environ.setdefault("GRPC_TRACE", "")

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
