import os, sys, subprocess, time, signal

os.chdir(os.path.dirname(os.path.abspath(__file__)) or ".")

signal.signal(signal.SIGHUP, signal.SIG_IGN)
signal.signal(signal.SIGTERM, signal.SIG_IGN)

env = {**os.environ, "NODE_ENV": "development"}
os.execvp("npx", ["npx", "tsx", "server/index.ts"])
