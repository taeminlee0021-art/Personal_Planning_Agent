"""Allowlisted read tools delegate to normal application services."""
import json

NAMES = ("get_tasks", "get_fixed_schedules", "get_preferences", "get_current_plan", "get_available_time_slots")
TOOLS = [{"type": "function", "name": name, "description": "Read current application " + name.removeprefix("get_"),
          "parameters": {"type": "object", "properties": {}, "required": [], "additionalProperties": False},
          "strict": True} for name in NAMES]


def execute(service, name, arguments):
    if name not in NAMES:
        raise ValueError("Unknown read tool")
    if json.loads(arguments) != {}:
        raise ValueError("Read tools accept no arguments")
    return getattr(service, name)()
