#!/usr/bin/env python3
"""Emit the deploy workflow's run steps as tab-separated name and command, in file order.

Kept as a file rather than a heredoc inside the shell script that uses it. The first version
embedded this in a process substitution and the shell mangled the Python before it ran, which cost
more time than the extraction itself.
"""
import re
import sys

y = open(sys.argv[1], encoding='utf-8').read()
name = None
for line in y.split('\n'):
    m = re.match(r'^      - name: (.+)$', line)
    if m:
        name = m.group(1).strip()
        continue
    m = re.match(r'^        run: (.+)$', line)
    if m and name:
        print(f'{name}\t{m.group(1).strip()}')
        name = None
