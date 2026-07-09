// news.mjs — "What's New in WinUI land": the #ifdef WINDOWS dev blog feed.
//
// The blog lives on Microsoft DevBlogs (WordPress), which exposes a standard
// RSS 2.0 feed. We fetch + parse it *server-side* (this module runs in the
// extension's Node host) so the canvas webview never has to make a
// cross-origin request — the client just calls the same-origin `/news` route.
//
// No XML dependency: the feed is small and regular, so a handful of focused
// string extractions is more robust here than pulling in a parser. (These
// regexes live server-side; the renderer's forbidden-regex rule does not apply.)

const FEED_URL = "https://devblogs.microsoft.com/ifdef-windows/feed/";
const BLOG_URL = "https://devblogs.microsoft.com/ifdef-windows/";
const TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_POSTS = 12;
const FETCH_TIMEOUT_MS = 12000;

let _cache = null; // { at:number, data:object }

// --- tiny helpers ---------------------------------------------------------

function firstMatch(text, re) {
    const m = re.exec(text);
    return m ? m[1] : "";
}

// Pull <tag>…</tag>, unwrapping a CDATA section when present.
function pickTag(block, tag) {
    const re = new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">", "i");
    let v = firstMatch(block, re).trim();
    const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/i.exec(v);
    if (cdata) v = cdata[1];
    return v.trim();
}

function pickAll(block, tag) {
    const re = new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">", "gi");
    const out = [];
    let m;
    while ((m = re.exec(block)) !== null) {
        let v = m[1].trim();
        const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/i.exec(v);
        if (cdata) v = cdata[1];
        v = v.trim();
        if (v) out.push(v);
    }
    return out;
}

const ENTITIES = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'",
    "&nbsp;": " ", "&hellip;": "\u2026", "&#8230;": "\u2026",
    "&#8217;": "\u2019", "&#8216;": "\u2018", "&#8220;": "\u201C", "&#8221;": "\u201D",
    "&#8211;": "\u2013", "&#8212;": "\u2014", "&#038;": "&", "&#39;": "'",
};

function decodeEntities(s) {
    let out = s.replace(/&#[0-9]+;|&#x[0-9a-f]+;|&[a-z]+;/gi, (e) => {
        if (ENTITIES[e] != null) return ENTITIES[e];
        if (ENTITIES[e.toLowerCase()] != null) return ENTITIES[e.toLowerCase()];
        let code = null;
        if (/^&#x/i.test(e)) code = parseInt(e.slice(3, -1), 16);
        else if (/^&#/.test(e)) code = parseInt(e.slice(2, -1), 10);
        if (code && isFinite(code)) { try { return String.fromCodePoint(code); } catch { return e; } }
        return e;
    });
    return out;
}

function stripHtml(html) {
    return decodeEntities(String(html || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// The DevBlogs excerpt always ends with a "The post … appeared first on …"
// paragraph — drop it, then flatten to a clean sentence or two.
function cleanExcerpt(descHtml) {
    let s = String(descHtml || "");
    const cut = s.search(/<p>\s*The post\s/i);
    if (cut >= 0) s = s.slice(0, cut);
    s = stripHtml(s);
    if (s.length > 260) s = s.slice(0, 257).replace(/\s+\S*$/, "") + "\u2026";
    return s;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateLabel(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return "";
    return MONTHS[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + d.getUTCFullYear();
}

// Tags to hide (site-wide / low-signal) so the chips stay meaningful.
const TAG_DROP = new Set(["ifdef-windows", "uncategorized", "microsoft"]);

function cleanTags(list) {
    const seen = new Set();
    const out = [];
    for (const raw of list) {
        const t = decodeEntities(raw).trim();
        const key = t.toLowerCase();
        if (!t || TAG_DROP.has(key) || seen.has(key) || t.length < 2) continue;
        seen.add(key);
        out.push(t);
        if (out.length >= 5) break;
    }
    return out;
}

function parseFeed(xml) {
    const items = pickAll(xml, "item");
    // pickAll unwraps nothing weird for <item> (no CDATA), but strips outer tag.
    const blocks = String(xml).split(/<item>/i).slice(1).map((b) => b.split(/<\/item>/i)[0]);
    return blocks.slice(0, MAX_POSTS).map((block) => {
        const title = decodeEntities(pickTag(block, "title"));
        const link = pickTag(block, "link");
        const author = decodeEntities(pickTag(block, "dc:creator"));
        const pub = pickTag(block, "pubDate");
        const d = pub ? new Date(pub) : null;
        const excerpt = cleanExcerpt(pickTag(block, "description"));
        const tags = cleanTags(pickAll(block, "category"));
        const image = firstMatch(block, /<image[^>]*\burl="([^"]+)"/i) ||
            firstMatch(block, /<media:content[^>]*\burl="([^"]+)"/i) ||
            firstMatch(block, /<enclosure[^>]*\burl="([^"]+)"/i);
        return {
            title,
            link,
            author,
            date: d && !isNaN(d.getTime()) ? d.toISOString() : "",
            dateLabel: dateLabel(d),
            excerpt,
            tags,
            image: image || "",
        };
    }).filter((p) => p.title && p.link);
}

async function fetchFeed() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(FEED_URL, {
            signal: ctrl.signal,
            headers: {
                "user-agent": "WinUI-Studio-Canvas/1.0 (+github.com/microsoft/win-dev-skills)",
                "accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
            },
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        return await res.text();
    } finally {
        clearTimeout(timer);
    }
}

// getNews({ force }) → { ok, updated, blogUrl, source, posts } | { ok:false, error, blogUrl }
export async function getNews(opts = {}) {
    const force = !!opts.force;
    if (!force && _cache && Date.now() - _cache.at < TTL_MS) return _cache.data;
    try {
        const xml = await fetchFeed();
        const posts = parseFeed(xml);
        const data = {
            ok: true,
            updated: new Date().toISOString(),
            blogUrl: BLOG_URL,
            source: FEED_URL,
            posts,
        };
        _cache = { at: Date.now(), data };
        return data;
    } catch (err) {
        // On failure, serve any stale cache we have rather than nothing.
        if (_cache && _cache.data && _cache.data.ok) {
            return { ..._cache.data, stale: true };
        }
        return {
            ok: false,
            blogUrl: BLOG_URL,
            error: String((err && err.message) || err || "fetch failed"),
        };
    }
}
