#!/usr/bin/env python3
"""
供 Node.js server 调用的搜索脚本：使用 ddgs 库（DuckDuckGo + Bing 回退）。
国内无代理时 DuckDuckGo 常不可用，Bing 可正常返回结果。

用法: python3 search_with_ddgs.py "北京天气" [max_results=5]
输出: 标准输出一行 JSON 数组 [{ "title", "url", "snippet" }, ...]
"""
import sys
import json

def main():
    if len(sys.argv) < 2:
        print("[]", flush=True)
        return
    query = sys.argv[1]
    max_results = 5
    if len(sys.argv) >= 3:
        try:
            max_results = int(sys.argv[2])
        except ValueError:
            pass

    out = []
    try:
        from ddgs import DDGS
        ddgs = DDGS()
        results = []
        try:
            results = list(ddgs.text(query, max_results=max_results, backend="duckduckgo"))
        except Exception:
            pass
        if not results:
            try:
                results = list(ddgs.text(query, max_results=max_results, backend="bing"))
            except Exception:
                pass
        for r in results:
            title = r.get("title", r.get("name", ""))
            url = r.get("href", r.get("url", r.get("link", "")))
            body = r.get("body", r.get("snippet", r.get("description", "")))
            out.append({"title": title or "无标题", "url": url or "", "snippet": body or ""})
    except Exception as e:
        # 不把异常打到 stdout，只返回空数组；stderr 可写日志
        sys.stderr.write(f"search_with_ddgs error: {e}\n")
    print(json.dumps(out, ensure_ascii=False), flush=True)

if __name__ == "__main__":
    main()
