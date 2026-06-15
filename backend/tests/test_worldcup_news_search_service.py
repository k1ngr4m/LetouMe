from __future__ import annotations

import unittest

from backend.app.services.worldcup_news_search_service import WorldCupNewsSearchService


class WorldCupNewsSearchServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = WorldCupNewsSearchService()

    def test_parse_bing_rss_decodes_links_dates_and_dedupes(self) -> None:
        rss = """<?xml version="1.0" encoding="utf-8"?>
        <rss version="2.0" xmlns:News="https://www.bing.com/news/search">
          <channel>
            <item>
              <title>Spain team news before World Cup match</title>
              <link>http://www.bing.com/news/apiclick.aspx?url=https%3a%2f%2fexample.com%2fspain-team-news</link>
              <description><![CDATA[<b>Spain</b> update with injury notes.]]></description>
              <pubDate>Sun, 14 Jun 2026 23:16:02 GMT</pubDate>
              <News:Source>MSN</News:Source>
            </item>
            <item>
              <title>Duplicate Spain team news before World Cup match</title>
              <link>http://www.bing.com/news/apiclick.aspx?url=https%3a%2f%2fexample.com%2fspain-team-news</link>
              <description>Duplicate result</description>
              <pubDate>Sun, 14 Jun 2026 23:30:00 GMT</pubDate>
              <News:Source>MSN</News:Source>
            </item>
          </channel>
        </rss>
        """

        results = self.service._parse_bing_rss(rss, max_results=5)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["url"], "https://example.com/spain-team-news")
        self.assertEqual(results[0]["source"], "MSN")
        self.assertEqual(results[0]["published_at"], "2026-06-14 23:16:02")
        self.assertEqual(results[0]["snippet"], "Spain update with injury notes.")

    def test_parse_gdelt_payload_normalizes_and_limits_results(self) -> None:
        payload = {
            "articles": [
                {
                    "title": "Cape Verde injury update " * 20,
                    "url": "https://news.example.com/cape-verde",
                    "domain": "news.example.com",
                    "seendate": "20260615091500",
                    "summary": "Cape Verde squad notes.",
                },
                {
                    "title": "Second result",
                    "url": "https://news.example.com/second",
                    "domain": "news.example.com",
                    "seendate": "20260615100000",
                },
            ]
        }

        results = self.service._parse_gdelt_payload(payload, max_results=1)

        self.assertEqual(len(results), 1)
        self.assertLessEqual(len(results[0]["title"]), 160)
        self.assertEqual(results[0]["source"], "news.example.com")
        self.assertEqual(results[0]["published_at"], "2026-06-15 09:15:00")
        self.assertEqual(results[0]["snippet"], "Cape Verde squad notes.")


if __name__ == "__main__":
    unittest.main()
