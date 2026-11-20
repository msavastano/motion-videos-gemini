#!/usr/bin/env python3
"""Build subtle, beat-synced sound effects from vo.json cues and beats.json."""
import json
import subprocess
from pathlib import Path

vo = json.loads(Path("vo.json").read_text(encoding="utf-8"))
beats = json.loads(Path("beats.json").read_text(encoding="utf-8"))
plan = json.loads(Path("plan.json").read_text(encoding="utf-8"))
cues_map = vo["cues"]
dur = float(plan["duration"])


def snap_beat(t, max_shift=0.14):
    """Snap a transition cue to the nearest beat if within max_shift seconds."""
    best = min(beats["beats"], key=lambda b: abs(b - t))
    return best if abs(best - t) <= max_shift else t


sfx = []

def add(t, typ, gain=0.22, **kw):
    if 0 <= t <= dur:
        item = {"t": round(t, 4), "type": typ, "gain": gain}
        item.update(kw)
        sfx.append(item)

# Act 1: Cold open — bar entry and rapid bisection slices
add(0.25, "paper", 0.20, dur=0.18)
add(cues_map["no_present"], "tick", 0.25)
slice_t = cues_map["slice"]
for k, dt in enumerate((0.0, 0.55, 1.05, 1.50, 1.90)):
    add(slice_t + dt, "tick", 0.18 + 0.03 * k)
add(slice_t + 2.15, "click", 0.26)
add(cues_map["tenth"], "blip", 0.16)

# Act 2: Augustine's puzzle — origin wall, Pusey quote, calipers
add(snap_beat(12.0), "paper", 0.22, dur=0.20)
add(cues_map["no_before"], "thump", 0.28)
add(cues_map["i_know"], "tick", 0.18)
add(cues_map["know_not"], "tick", 0.22)
add(snap_beat(30.15), "paper", 0.18, dur=0.16)
add(cues_map["measure"], "click", 0.24)
add(cues_map["measure"] + 0.65, "click", 0.20)

# Act 3: Distentio animi, three zones, psalm flow, scaling
add(cues_map["distentio"], "whoosh", 0.18)
add(cues_map["p_memory"], "tick", 0.22)
add(cues_map["p_attention"], "bell", 0.16)
add(cues_map["p_expectation"], "tick", 0.22)
# Soft rhythmic psalm word ticks across the slit
psalm_start = cues_map["psalm"] + 0.4
for b in beats["beats"]:
    if psalm_start <= b <= 58.6:
        add(b, "tick", 0.08)
add(cues_map["scale_line"], "click", 0.20)
add(cues_map["scale_life"], "click", 0.24)
add(cues_map["scale_history"], "thump", 0.22)

# Act 4: AI version — discrete token ticks, attention lock, timestamp collapse, postmark, parallel
add(snap_beat(63.65), "key", 0.24)
for b in beats["beats"]:
    if 66.5 <= b <= 79.2:
        add(b, "key", 0.09)
add(cues_map["ai_context"], "blip", 0.18)
add(cues_map["ai_spread"], "tick", 0.20)
add(cues_map["ai_attention"], "bell", 0.20)

# Timestamps & gap collapse
add(cues_map["ts1"], "stamp", 0.22)
add(cues_map["ts2"], "stamp", 0.22)
add(cues_map["ts3"], "stamp", 0.22)
add(cues_map["ai_nobefore"] - 1.6, "whoosh", 0.20)
add(cues_map["ai_nobefore"] - 1.15, "thump", 0.26)

# Postmark & diary
add(cues_map["cutoff"], "stamp", 0.26)
add(cues_map["postmark"], "stamp", 0.22)
add(cues_map["diary"], "paper", 0.24, dur=0.16)

# Parallel recitations fanning out
par_t = cues_map["parallel"]
for k in range(6):
    add(par_t + k * 0.11, "tick", 0.14)

# Act 5: Coda — gathered stillness
add(cues_map["scattered"], "whoosh", 0.14)
add(cues_map["gathered"], "bell", 0.18)
add(cues_map["cant_tell"], "tick", 0.12)

sfx.sort(key=lambda x: x["t"])
Path("audio/sfx_cues.json").write_text(json.dumps(sfx, indent=1) + "\n", encoding="utf-8")
subprocess.run(["node", "../../tools/sfx.mjs", "audio/sfx_cues.json", "audio/sfx.wav", str(dur)], check=True)
print(f"wrote audio/sfx.wav with {len(sfx)} cues over {dur}s")
