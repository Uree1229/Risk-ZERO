import json

from .demo import build_demo_event

print(json.dumps(build_demo_event().to_dict(), ensure_ascii=False, indent=2))
