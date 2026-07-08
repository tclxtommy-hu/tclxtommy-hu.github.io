# 文本统计脚本（与 run.js 同逻辑），由沙盒以子进程方式执行。
# 输入：从 stdin 读取一行 JSON（即传入的原始文本字符串）
# 输出：把统计结果 JSON 写到 stdout，作为「沙盒权威结果」
import sys
import json
import re
from collections import Counter


def main():
    raw = sys.stdin.read()
    try:
        data = json.loads(raw)
    except Exception:
        data = raw
    text = data if isinstance(data, str) else str(data)

    chars = len(text)
    words = text.strip().split() if text.strip() else []
    word_count = len(words)

    freq = Counter()
    for w in words:
        k = re.sub(r"[^\w]", "", w.lower())
        if k:
            freq[k] += 1
    top_words = [{"word": w, "count": c} for w, c in freq.most_common(3)]

    sentences = len([s for s in re.split(r"[。.!?！？]+", text) if s.strip()])

    out = {
        "chars": chars,
        "wordCount": word_count,
        "sentences": sentences,
        "topWords": top_words,
    }
    sys.stdout.write(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
