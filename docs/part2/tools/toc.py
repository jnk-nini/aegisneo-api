import subprocess, json, re, sys
pdf, src, out = sys.argv[1:4]
n = int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout).group(1))
pages = [subprocess.run(['pdftotext', '-f', str(i), '-l', str(i), '-layout', pdf, '-'], capture_output=True, text=True).stdout for i in range(1, n + 1)]
s = open(src).read().split('// ---------- Introduction ----------')[1].split('// ---------- References ----------')[0]
heads = re.findall(r"add\(H[12]\('([^']+)'\)\)", s) + ['5. References']
norm = lambda t: re.sub(r'\s+', ' ', t)
toc = {}
start = 3  # skip cover and contents
for h in heads:
    for i in range(start, n + 1):
        if any(norm(l).strip() == h for l in pages[i - 1].splitlines()):
            toc[h] = i; start = i; break
    else:
        print('NOT FOUND', h)
json.dump(toc, open(out, 'w'), indent=1); print(toc)
