"""Entry point: python pipeline/run.py"""
import sys
import os
from pathlib import Path

# Ensure pipeline root is on the path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

import uvicorn
from backend.main import app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7000))
    print(f"\n🚀 RuleForge Validation Pipeline running at http://localhost:{port}\n")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
