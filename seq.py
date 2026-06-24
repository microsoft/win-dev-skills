import sys
f = sys.argv[1]
out = []
for l in open(f).read().splitlines():
    if l.startswith("pick 418295c"):
        continue
    if l.startswith("pick e4662c2"):
        out.append(l.replace("pick", "edit", 1)); continue
    out.append(l)
open(f, "w").write("\n".join(out) + "\n")
