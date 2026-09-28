var pagedPending = null;
var pageTurnLock = 0;
var pageMask = null;
var dualPage = true;
var spreadMates = [];
document.dualPage = dualPage;

function PageMargin() {
    var fs = 26;
    if (document.userSettings && document.userSettings.bookFontSize)
        fs = document.userSettings.bookFontSize;
    return Math.max(28, Math.round(fs * 2));
}

function PageAvail() {
    return Math.max(80, direction.GetWindowLength() - PageMargin() * 2);
}

function CopyRect(b) {
    return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height };
}

function UnionBox(a, b) {
    if (!a) return b;
    if (!b) return a;
    return {
        left: Math.min(a.left, b.left),
        right: Math.max(a.right, b.right),
        top: Math.min(a.top, b.top),
        bottom: Math.max(a.bottom, b.bottom)
    };
}

function Median(arr) {
    if (!arr.length) return 0;
    arr = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[m] : 0.5 * (arr[m - 1] + arr[m]);
}

function TagName(el) {
    return el && el.tagName ? el.tagName.toUpperCase() : "";
}

function IsSkippedTextParent(el) {
    var t = TagName(el);
    return t === "SCRIPT" || t === "STYLE" || t === "TITLE" || t === "DESC" || t === "RT" || t === "RP";
}

function ClosestRuby(node) {
    while (node) {
        if (node.nodeType === 1 && TagName(node) === "RUBY") return node;
        node = node.parentNode;
    }
    return null;
}

function FitImagesToPage(frame, avail, rtl) {
    var doc = frame.contentDocument;
    if (!doc) return;
    var els = doc.querySelectorAll("img,svg");
    var capW = rtl ? avail : (frame.offsetWidth || 1);
    var capH = rtl ? (frame.offsetHeight || 1) : avail;
    var i;
    for (i = 0; i < els.length; i++) {
        var el = els[i];
        var b = el.getBoundingClientRect();
        if (b.width < 0.5 || b.height < 0.5) continue;
        if (rtl && b.width > avail + 1) {
            el.style.maxWidth = capW + "px";
            el.style.maxHeight = capH + "px";
            el.style.height = "auto";
            el.style.width = "auto";
            el.style.objectFit = "contain";
        }
        if (!rtl && b.height > avail + 1) {
            el.style.maxHeight = capH + "px";
            el.style.maxWidth = capW + "px";
            el.style.width = "auto";
            el.style.height = "auto";
            el.style.objectFit = "contain";
        }
    }
    if (doc.body) doc.body.offsetHeight;
}

function CollectAtoms(frame, avail, rtl, fw, fh) {
    var doc = frame.contentDocument;
    var out = [];
    if (!doc || !doc.body) return out;
    var seenRuby = [];
    var charOffset = 0;
    var walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
    while (walker.nextNode()) {
        var node = walker.currentNode;
        if (!node.data || !node.data.replace(/\s+/g, "").length) continue;
        if (IsSkippedTextParent(node.parentElement)) continue;
        var ruby = ClosestRuby(node);
        if (ruby) {
            if (seenRuby.indexOf(ruby) >= 0) continue;
            seenRuby.push(ruby);
            var rb = ruby.getBoundingClientRect();
            if (rb.width >= 0.5 && rb.height >= 0.5 && !IsHugeRect(rb, avail, fw, fh, rtl)) {
                var rec = CopyRect(rb);
                rec.isRuby = true;
                rec.charOffset = charOffset;
                out.push(rec);
            }
            var base = ruby.textContent || "";
            charOffset += base.replace(/\s+/g, "").length;
            continue;
        }
        charOffset = AddTextAtoms(doc, node, out, avail, rtl, fw, fh, charOffset);
    }
    var extra = doc.querySelectorAll("img, svg");
    for (var i = 0; i < extra.length; i++) {
        var b = extra[i].getBoundingClientRect();
        if (b.width < 0.5 || b.height < 0.5) continue;
        if (IsHugeRect(b, avail, fw, fh, rtl)) continue;
        var img = CopyRect(b);
        img.isImage = true;
        img.charOffset = charOffset;
        out.push(img);
    }
    return out;
}

function IsHugeRect(r, avail, frameW, frameH, rtl) {
    if (rtl) return r.width > avail * 0.95 && r.height > frameH * 0.8;
    return r.height > avail * 0.95 && r.width > frameW * 0.8;
}

function AddTextAtoms(doc, node, out, avail, rtl, fw, fh, charOffset) {
    var range = doc.createRange();
    range.selectNodeContents(node);
    var rects;
    try { rects = range.getClientRects(); }
    catch (e) { return charOffset; }
    var tooBig = false;
    var i;
    for (i = 0; i < rects.length; i++) {
        if (rects[i].width < 0.5 || rects[i].height < 0.5) continue;
        if (IsHugeRect(rects[i], avail, fw, fh, rtl)) continue;
        var cross = rtl ? rects[i].width : rects[i].height;
        if (cross > avail + 1) tooBig = true;
    }
    if (!tooBig) {
        for (i = 0; i < rects.length; i++) {
            if (rects[i].width < 0.5 || rects[i].height < 0.5) continue;
            if (IsHugeRect(rects[i], avail, fw, fh, rtl)) continue;
            var rec = CopyRect(rects[i]);
            rec.charOffset = charOffset;
            out.push(rec);
        }
        charOffset += (node.data || "").replace(/\s+/g, "").length;
        return charOffset;
    }
    var text = node.data;
    for (var c = 0; c < text.length; c++) {
        if (text[c] === " " || text[c] === "\n" || text[c] === "\t" || text[c] === "\r") continue;
        var n = 1;
        if (text.charCodeAt(c) >= 0xD800 && text.charCodeAt(c) <= 0xDBFF && c + 1 < text.length) n = 2;
        try {
            range.setStart(node, c);
            range.setEnd(node, c + n);
            var cr = range.getBoundingClientRect();
            if (cr.width >= 0.5 && cr.height >= 0.5) {
                var atom = CopyRect(cr);
                atom.charOffset = charOffset;
                out.push(atom);
            }
        } catch (e2) { }
        charOffset++;
        if (n === 2) c++;
    }
    return charOffset;
}

function SamplePitch(atoms, rtl) {
    var sizes = [];
    var i;
    for (i = 0; i < atoms.length; i++) {
        var sz = rtl ? (atoms[i].right - atoms[i].left) : (atoms[i].bottom - atoms[i].top);
        if (sz > 4 && sz < 180) sizes.push(sz);
    }
    var med = Median(sizes);
    if (!(med >= 8)) med = 26;
    var centers = [];
    for (i = 0; i < atoms.length; i++) {
        centers.push(rtl ? (atoms[i].left + atoms[i].right) / 2 : (atoms[i].top + atoms[i].bottom) / 2);
    }
    centers.sort(function (a, b) { return a - b; });
    var gaps = [];
    for (i = 1; i < centers.length; i++) {
        var g = centers[i] - centers[i - 1];
        if (g > med * 0.6 && g < med * 4) gaps.push(g);
    }
    var gap = Median(gaps);
    if (gap >= med * 0.8) return gap;
    return med * 1.7;
}

function ClusterStrips(atoms, rtl, pitch, fw, fh) {
    if (!atoms.length) return [];
    var thresh = pitch * 0.45;
    var cols = [];
    var i, k;
    function addTo(col, r) {
        col.left = Math.min(col.left, r.left);
        col.right = Math.max(col.right, r.right);
        col.top = Math.min(col.top, r.top);
        col.bottom = Math.max(col.bottom, r.bottom);
        if (r.isImage) col.isImage = true;
        if (typeof r.charOffset === "number") {
            if (typeof col.charOffset !== "number") col.charOffset = r.charOffset;
            else col.charOffset = Math.min(col.charOffset, r.charOffset);
        }
        col.c = rtl ? (col.left + col.right) / 2 : (col.top + col.bottom) / 2;
        col.atoms.push(r);
    }
    for (i = 0; i < atoms.length; i++) {
        var r = atoms[i];
        var c = rtl ? (r.left + r.right) / 2 : (r.top + r.bottom) / 2;
        var best = -1, bestD = thresh;
        for (k = 0; k < cols.length; k++) {
            var d = Math.abs(c - cols[k].c);
            if (d < bestD) { bestD = d; best = k; }
        }
        if (best >= 0) addTo(cols[best], r);
        else cols.push({
            left: r.left, right: r.right, top: r.top, bottom: r.bottom,
            c: c, isImage: !!r.isImage, charOffset: r.charOffset, atoms: [r]
        });
    }
    if (rtl) cols.sort(function (a, b) { return b.right - a.right; });
    else cols.sort(function (a, b) { return a.top - b.top; });
    return cols;
}

function ClusterByPitchGrid(atoms, rtl, pitch) {
    var buckets = {};
    var keys = [];
    var i;
    for (i = 0; i < atoms.length; i++) {
        var r = atoms[i];
        var c = rtl ? (r.left + r.right) / 2 : (r.top + r.bottom) / 2;
        var key = Math.round(c / pitch);
        if (!buckets[key]) {
            buckets[key] = {
                left: r.left, right: r.right, top: r.top, bottom: r.bottom,
                c: c, isImage: !!r.isImage, charOffset: r.charOffset, atoms: []
            };
            keys.push(key);
        }
        var col = buckets[key];
        col.left = Math.min(col.left, r.left);
        col.right = Math.max(col.right, r.right);
        col.top = Math.min(col.top, r.top);
        col.bottom = Math.max(col.bottom, r.bottom);
        if (r.isImage) col.isImage = true;
        if (typeof r.charOffset === "number") {
            if (typeof col.charOffset !== "number") col.charOffset = r.charOffset;
            else col.charOffset = Math.min(col.charOffset, r.charOffset);
        }
        col.atoms.push(r);
        col.c = rtl ? (col.left + col.right) / 2 : (col.top + col.bottom) / 2;
    }
    keys.sort(function (a, b) { return a - b; });
    var cols = [];
    for (i = 0; i < keys.length; i++) cols.push(buckets[keys[i]]);
    if (rtl) cols.sort(function (a, b) { return b.right - a.right; });
    else cols.sort(function (a, b) { return a.top - b.top; });
    return cols;
}

function StripFullyBefore(s, prevEnd, rtl) {
    if (prevEnd == null) return false;
    if (rtl) return s.left >= prevEnd - 0.5;
    return s.bottom <= prevEnd + 0.5;
}

function ClampPageToCursor(pg, start, avail, rtl) {
    if (rtl) {
        pg.right = Math.min(pg.right, Math.ceil(start));
        if (pg.right - pg.left > avail) pg.left = Math.floor(pg.right - avail);
        if (pg.left > pg.right) pg.left = pg.right;
    } else {
        pg.top = Math.max(pg.top, Math.floor(start));
        if (pg.bottom - pg.top > avail) pg.bottom = Math.ceil(pg.top + avail);
        if (pg.bottom < pg.top) pg.bottom = pg.top;
    }
}

function PageSpan(pg, rtl) {
    return rtl ? (pg.right - pg.left) : (pg.bottom - pg.top);
}

function MakePagesDisjoint(pages, rtl) {
    var out = [];
    for (var i = 0; i < pages.length; i++) {
        var pg = pages[i];
        if (out.length) {
            var prev = out[out.length - 1];
            if (rtl) {
                if (pg.right > prev.left) pg.right = prev.left;
                if (pg.left > pg.right) pg.left = pg.right;
            } else {
                if (pg.top < prev.bottom) pg.top = prev.bottom;
                if (pg.bottom < pg.top) pg.bottom = pg.top;
            }
        }
        if (PageSpan(pg, rtl) < 1) continue;
        out.push(pg);
    }
    return out.length ? out : pages;
}

function PackCompleteStrips(strips, avail, rtl) {
    var pages = [];
    if (!strips.length) return pages;
    var i = 0;
    var prevEnd = null;
    while (i < strips.length) {
        while (i < strips.length && StripFullyBefore(strips[i], prevEnd, rtl)) i++;
        if (i >= strips.length) break;
        var start = rtl ? strips[i].right : strips[i].top;
        if (prevEnd != null) start = rtl ? Math.min(start, prevEnd) : Math.max(start, prevEnd);
        var box = {
            left: strips[i].left, right: strips[i].right,
            top: strips[i].top, bottom: strips[i].bottom
        };
        var firstSpan = rtl ? (start - box.left) : (box.bottom - start);
        if (!(firstSpan > 0)) firstSpan = rtl ? (box.right - box.left) : (box.bottom - box.top);
        if (firstSpan > avail + 1) {
            var one = MakePage(box, strips, i, i, rtl);
            ClampPageToCursor(one, start, avail, rtl);
            if (PageSpan(one, rtl) >= 1) {
                pages.push(one);
                prevEnd = rtl ? one.left : one.bottom;
            }
            i++;
            continue;
        }
        var j = i;
        var end = rtl ? strips[i].left : strips[i].bottom;
        while (j + 1 < strips.length) {
            var n = strips[j + 1];
            var trialEnd = rtl ? Math.min(end, n.left) : Math.max(end, n.bottom);
            var span = rtl ? (start - trialEnd) : (trialEnd - start);
            if (span > avail + 0.5) break;
            box = UnionBox(box, n);
            end = trialEnd;
            j++;
        }
        var page = MakePage(box, strips, i, j, rtl);
        ClampPageToCursor(page, start, avail, rtl);
        if (PageSpan(page, rtl) >= 1) {
            pages.push(page);
            prevEnd = rtl ? page.left : page.bottom;
        }
        i = j + 1;
    }
    return MakePagesDisjoint(pages, rtl);
}

function MakePage(box, strips, i0, i1, rtl) {
    var k;
    for (k = i0; k <= i1; k++) {
        var atoms = strips[k].atoms;
        if (!atoms) continue;
        for (var a = 0; a < atoms.length; a++) box = UnionBox(box, atoms[a]);
    }
    return {
        left: Math.floor(box.left),
        right: Math.ceil(box.right),
        top: Math.floor(box.top),
        bottom: Math.ceil(box.bottom),
        charOffset: strips[i0].charOffset || 0,
        i0: i0,
        i1: i1
    };
}

function FullFramePage(frame) {
    var w = frame.offsetWidth || 1;
    var h = frame.offsetHeight || 1;
    return { left: 0, right: w, top: 0, bottom: h, charOffset: 0 };
}

function BuildPageTable(frame) {
    if (!frame || !frame.contentDocument) {
        frame.pages = [FullFramePage(frame)];
        frame.pageIndex = 0;
        frame.num = 0;
        frame.totalPage = 1;
        return;
    }
    if (frame.imagePage) {
        CaptureImageNaturalSize(frame);
        frame.pages = [FullFramePage(frame)];
        frame.pageIndex = 0;
        frame.num = 0;
        frame.totalPage = 1;
        return;
    }
    var rtl = (direction === direction_rtl);
    var avail = PageAvail();
    FitImagesToPage(frame, avail, rtl);
    direction.AdjustFrameSize(frame);
    try {
        if (frame.contentWindow) frame.contentWindow.scrollTo(0, 0);
        if (frame.contentDocument && frame.contentDocument.documentElement) {
            frame.contentDocument.documentElement.scrollLeft = 0;
            frame.contentDocument.documentElement.scrollTop = 0;
        }
    } catch (e) { }
    var fw = frame.offsetWidth || 1;
    var fh = frame.offsetHeight || 1;
    var atoms = CollectAtoms(frame, avail, rtl, fw, fh);
    var pitch = SamplePitch(atoms, rtl);
    var strips = ClusterStrips(atoms, rtl, pitch, fw, fh);
    var longAxis = rtl ? fw : fh;
    if (strips.length <= 1 && longAxis > avail * 1.5 && atoms.length > 4) {
        strips = ClusterByPitchGrid(atoms, rtl, pitch);
        console.log("paged chapter " + frame.urlIndex + ": recluster by pitch grid, strips=" + strips.length);
    }
    var pages = PackCompleteStrips(strips, avail, rtl);
    pages = MakePagesDisjoint(pages, rtl);
    console.log("paged chapter " + frame.urlIndex + ": atoms=" + atoms.length + " strips=" + strips.length + " pages=" + pages.length + " avail=" + avail + " pitch=" + pitch.toFixed(1) + " frame=" + fw + "x" + fh);
    if (!pages.length) pages = [FullFramePage(frame)];
    frame.strips = strips;
    frame.pages = pages;
    frame.totalPage = pages.length;
    if (!(frame.pageIndex >= 0)) frame.pageIndex = 0;
    if (frame.pageIndex >= pages.length) frame.pageIndex = pages.length - 1;
    frame.num = frame.pageIndex;
}

function PageIndexForSelector(frame, selector) {
    try {
        var t = frame.contentDocument.querySelector(selector);
        if (!t) return 0;
        return PageIndexContaining(frame, t.getBoundingClientRect());
    } catch (e) {
        return 0;
    }
}

function PageIndexContaining(frame, r) {
    if (!frame.pages || !frame.pages.length) return 0;
    var rtl = (direction === direction_rtl);
    var mid = rtl ? ((r.left + r.right) / 2) : ((r.top + r.bottom) / 2);
    for (var i = 0; i < frame.pages.length; i++) {
        var p = frame.pages[i];
        if (rtl) {
            if (mid >= p.left && mid <= p.right) return i;
        } else {
            if (mid >= p.top && mid <= p.bottom) return i;
        }
    }
    if (rtl) {
        if (mid > frame.pages[0].right) return 0;
        return frame.pages.length - 1;
    }
    if (mid < frame.pages[0].top) return 0;
    return frame.pages.length - 1;
}

function PageIndexForCharOffset(frame, offset) {
    if (!frame.pages || !frame.pages.length) return 0;
    var idx = 0;
    for (var i = 0; i < frame.pages.length; i++) {
        if ((frame.pages[i].charOffset || 0) <= offset) idx = i;
        else break;
    }
    return idx;
}

function FindFrame(urlIndex) {
    for (var i = 0; i < frameList.length; i++) {
        if (frameList[i].urlIndex == urlIndex) return frameList[i];
    }
    return null;
}

function SpreadProp(urlIndex) {
    return (spreadList && spreadList[urlIndex]) || "";
}

function IsCoverIndex(urlIndex) {
    return urlIndex === 0;
}

function IsPrePaginated(urlIndex) {
    if (document.bookFixedLayout) return true;
    var s = SpreadProp(urlIndex);
    return s.indexOf("pre-paginated") >= 0;
}

function IsForcedCenter(urlIndex) {
    if (IsCoverIndex(urlIndex)) return true;
    var s = SpreadProp(urlIndex);
    if (s.indexOf("page-spread-center") >= 0) return true;
    if (s.indexOf("rendition:spread-none") >= 0) return true;
    if (IsPrePaginated(urlIndex) && s.indexOf("page-spread-left") < 0 && s.indexOf("page-spread-right") < 0) return true;
    return false;
}

function IsRtlProgress() {
    return direction === direction_rtl;
}

function IsImageLike(urlIndex) {
    if (urlIndex < 0 || urlIndex >= urlList.length) return false;
    if (document.bookFixedLayout) return true;
    var s = SpreadProp(urlIndex);
    if (s.indexOf("pre-paginated") >= 0) return true;
    var f = FindFrame(urlIndex);
    if (f) return !!f.imagePage;
    return false;
}

function SpreadSide(urlIndex) {
    var s = SpreadProp(urlIndex);
    if (s.indexOf("page-spread-center") >= 0 || s.indexOf("rendition:spread-none") >= 0 || IsCoverIndex(urlIndex)) return "center";
    if (s.indexOf("page-spread-left") >= 0) return "left";
    if (s.indexOf("page-spread-right") >= 0) return "right";
    return "";
}

function BuildSpreadMates() {
    var mates = [];
    for (var i = 0; i < urlList.length; i++) mates[i] = -1;
    var rtl = IsRtlProgress();
    for (var i = 0; i + 1 < urlList.length;) {
        var a = SpreadSide(i);
        var b = SpreadSide(i + 1);
        if (IsImageLike(i) && IsImageLike(i + 1) && !IsForcedCenter(i) && !IsForcedCenter(i + 1) &&
            (rtl ? a === "right" && b === "left" : a === "left" && b === "right")) {
            mates[i] = i + 1;
            mates[i + 1] = i;
            i += 2;
        } else {
            i++;
        }
    }
    return mates;
}

function ImageAlign(frame) {
    if (!frame || !dualPage || !IsImageLike(frame.urlIndex)) return "center";
    return SpreadSide(frame.urlIndex) || "center";
}

function PartnerIndex(frame) {
    if (!dualPage || !frame || !IsImageLike(frame.urlIndex) || IsForcedCenter(frame.urlIndex)) return null;
    var idx = spreadMates && spreadMates[frame.urlIndex];
    return idx >= 0 ? idx : null;
}

function SpreadPartner(frame) {
    var idx = PartnerIndex(frame);
    if (idx == null) return null;
    return FindFrame(idx);
}

function EnsurePageMask() {
    if (pageMask) return pageMask;
    pageMask = document.getElementById("pageMask");
    if (!pageMask) {
        pageMask = document.createElement("div");
        pageMask.id = "pageMask";
        document.body.appendChild(pageMask);
    }
    pageMask.onclick = null;
    pageMask.addEventListener("wheel", function (e) { if (paged) document.Wheel(e); }, { passive: false });
    return pageMask;
}

function ThemeMaskColor() {
    if (document.theme && document.theme.name === "dark") return "#000";
    if (document.theme && document.theme.name === "warm") return (document.userSettings && document.userSettings.warmColor) || "#ffe6a0";
    return "#fff";
}

function UpdatePageMask(frame, pg) {
    var mask = EnsurePageMask();
    if (!paged || !frame || !pg || frame.imagePage) {
        mask.style.display = "none";
        return;
    }
    var avail = PageAvail();
    var rtl = (direction === direction_rtl);
    var leftover = rtl ? (avail - (pg.right - pg.left)) : (avail - (pg.bottom - pg.top));
    if (leftover < 2) {
        mask.style.display = "none";
        return;
    }
    mask.style.display = "block";
    mask.style.background = ThemeMaskColor();
    mask.style.pointerEvents = "auto";
    if (rtl) {
        mask.style.top = "2vh";
        mask.style.height = "90vh";
        mask.style.left = "0";
        mask.style.width = (PageMargin() + leftover) + "px";
        mask.style.right = "auto";
        mask.style.bottom = "auto";
    } else {
        mask.style.left = "0";
        mask.style.width = "100vw";
        mask.style.top = "auto";
        mask.style.bottom = "0";
        mask.style.height = leftover + "px";
        mask.style.right = "auto";
    }
}

function CaptureImageNaturalSize(frame) {
    if (frame.imgNatW > 8 && frame.imgNatH > 8) return { w: frame.imgNatW, h: frame.imgNatH };
    var doc = frame.contentDocument;
    if (!doc) return null;
    var img = doc.querySelector("img,svg");
    var box = typeof ImagePixelSize === "function" ? ImagePixelSize(img) : null;
    if (!box && img) {
        var vw = 0, vh = 0;
        if (img.tagName === "SVG") {
            vw = parseFloat(img.getAttribute("width")) || 0;
            vh = parseFloat(img.getAttribute("height")) || 0;
            if ((!vw || !vh) && img.viewBox && img.viewBox.baseVal) {
                vw = img.viewBox.baseVal.width;
                vh = img.viewBox.baseVal.height;
            }
        } else {
            vw = img.naturalWidth || 0;
            vh = img.naturalHeight || 0;
        }
        if (vw > 0 && vh > 0) box = { w: vw, h: vh };
    }
    if (box && box.w > 8 && box.h > 8) {
        frame.imgNatW = box.w;
        frame.imgNatH = box.h;
        return box;
    }
    return null;
}

function ClearImageLayout(frame) {
    frame.style.minWidth = "";
    frame.style.minHeight = "";
    frame.style.maxWidth = "";
    frame.style.maxHeight = "";
    frame.style.transform = "";
}

function ContentBox() {
    return {
        top: Math.round(window.innerHeight * 0.02),
        height: Math.round(window.innerHeight * 0.90),
        width: window.innerWidth
    };
}

function ApplyImagePageVisual(frame) {
    frame.style.clipPath = "";
    frame.style.clip = "auto";
    frame.style.margin = "0";
    frame.style.border = "0";
    frame.style.transform = "";
    frame.style.setProperty("min-width", "0", "important");
    frame.style.setProperty("min-height", "0", "important");
    var nat = CaptureImageNaturalSize(frame);
    var box = ContentBox();
    var pairIndex = PartnerIndex(frame);
    var align = ImageAlign(frame);
    var partner = pairIndex == null ? null : FindFrame(pairIndex);
    var nat2 = pairIndex == null ? null : (partner && CaptureImageNaturalSize(partner));
    var wantDual = pairIndex != null && align !== "center" && nat && nat2;
    var maxH = box.height;
    var maxW = box.width;
    var w, h, left, top;
    if (wantDual) {
        var nw = nat.w, nh = nat.h;
        var nw2 = nat2.w, nh2 = nat2.h;
        h = maxH;
        var wL, wR;
        if (align === "left") {
            wL = h * nw / nh;
            wR = h * nw2 / nh2;
        } else {
            wR = h * nw / nh;
            wL = h * nw2 / nh2;
        }
        var total = wL + wR;
        if (total > maxW && total > 0) {
            var s = maxW / total;
            wL *= s;
            wR *= s;
            h *= s;
        }
        wL = Math.round(wL);
        wR = Math.round(wR);
        h = Math.round(h);
        var pairLeft = Math.round((maxW - (wL + wR)) / 2);
        top = box.top + Math.round((maxH - h) / 2);
        if (align === "left") {
            w = wL;
            left = pairLeft;
        } else {
            w = wR;
            left = pairLeft + wL;
        }
    } else if (nat && nat.w > 0 && nat.h > 0) {
        h = maxH;
        w = h * nat.w / nat.h;
        if (w > maxW) {
            w = maxW;
            h = w * nat.h / nat.w;
        }
        w = Math.round(w);
        h = Math.round(h);
        left = Math.round((maxW - w) / 2);
        top = box.top + Math.round((maxH - h) / 2);
    } else {
        w = maxW;
        h = maxH;
        left = 0;
        top = box.top;
    }
    frame.style.width = w + "px";
    frame.style.height = h + "px";
    frame.style.top = top + "px";
    frame.style.left = left + "px";
    frame.style.right = "auto";
    frame.style.bottom = "auto";
}

function ApplyPageVisual(frame, visible, pageBox) {
    if (!visible) {
        frame.style.visibility = "hidden";
        return;
    }
    frame.style.visibility = "visible";
    if (!frame.pages || !frame.pages.length || frame.imagePage) {
        ApplyImagePageVisual(frame);
        return;
    }
    ClearImageLayout(frame);
    var pg = pageBox || frame.pages[frame.pageIndex];
    var w = frame.offsetWidth;
    var h = frame.offsetHeight;
    var L = Math.max(0, Math.min(w, pg.left));
    var R = Math.max(0, Math.min(w, pg.right));
    var T = Math.max(0, Math.min(h, pg.top));
    var B = Math.max(0, Math.min(h, pg.bottom));
    if (R <= L) { L = 0; R = w; }
    if (B <= T) { T = 0; B = h; }
    if (direction === direction_rtl) {
        frame.style.left = "auto";
        frame.style.right = "0";
        frame.style.clipPath = "inset(0px " + (w - R) + "px 0px " + L + "px)";
        frame.style.clip = "rect(0px " + R + "px " + h + "px " + L + "px)";
        frame.pos = R - w + PageMargin();
    } else {
        frame.style.left = "0";
        frame.style.right = "auto";
        frame.style.clipPath = "inset(" + T + "px 0px " + (h - B) + "px 0px)";
        frame.style.clip = "rect(" + T + "px " + w + "px " + B + "px 0px)";
        frame.pos = -T + PageMargin();
    }
    direction.SetPosStyle(frame);
}

function EnsureFrame(urlIndex) {
    if (urlIndex < 0 || urlIndex >= urlList.length) return null;
    var f = FindFrame(urlIndex);
    if (f) return f;
    f = CreateFrame(urlIndex, 0, CheckLoadPaged);
    frameList.push(f);
    return f;
}

function ShowPage(frame, idx) {
    if (!frame) return;
    if (!frame.pages || !frame.pages.length) BuildPageTable(frame);
    if (!frame.pages || !frame.pages.length) frame.pages = [FullFramePage(frame)];
    if (idx < 0) idx = 0;
    if (idx >= frame.pages.length) idx = frame.pages.length - 1;
    currentFrame = frame;
    document.currentFrame = frame;
    frame.pageIndex = idx;
    frame.num = idx;
    frame.totalPage = frame.pages.length;
    var pairIndex = PartnerIndex(frame);
    var partner = pairIndex == null ? null : EnsureFrame(pairIndex);
    if (partner && (!partner.pages || !partner.pages.length)) {
        partner.style.visibility = "hidden";
    }
    var textBox = frame.pages[idx];
    for (var i = 0; i < frameList.length; i++) {
        var show = frameList[i] === frame || (partner && frameList[i] === partner && partner.imgNatW > 8 && partner.imgNatH > 8);
        ApplyPageVisual(frameList[i], show, show && frameList[i] === frame ? textBox : null);
    }
    UpdatePageMask(frame, textBox);
    if (typeof SetScrollBar === "function") SetScrollBar();
    if (typeof ScrollBarShow === "function") ScrollBarShow();
    if (typeof EnsureViewerFocus === "function") EnsureViewerFocus();
}

function CheckLoadPaged() {
    if (!currentFrame) return;
    var i = currentFrame.urlIndex;
    var have = {};
    var k;
    for (k = 0; k < frameList.length; k++) have[frameList[k].urlIndex] = frameList[k];
    var keep = {};
    keep[i] = true;
    var p = PartnerIndex(currentFrame);
    if (p != null) keep[p] = true;
    var reach = currentFrame.imagePage ? 3 : 1;
    function need(idx) {
        if (idx < 0 || idx >= urlList.length) return;
        keep[idx] = true;
        if (!have[idx]) {
            frameList.push(CreateFrame(idx, 0, CheckLoadPaged));
            have[idx] = true;
        }
    }
    need(i - 1);
    need(i + 1);
    if (reach > 1) {
        need(i - 2);
        need(i + 2);
    }
    if (reach > 2) {
        need(i - 3);
        need(i + 3);
    }
    if (p != null) need(p);
    for (k = frameList.length - 1; k >= 0; k--) {
        var u = frameList[k].urlIndex;
        if (keep[u]) continue;
        if (Math.abs(u - i) > reach) {
            DropFrame(frameList[k]);
            frameList.splice(k, 1);
        }
    }
}

function GoToChapterPage(urlIndex, pageIndex) {
    if (urlIndex < 0 || urlIndex >= urlList.length) return;
    var f = FindFrame(urlIndex);
    pagedPending = { urlIndex: urlIndex, pageIndex: pageIndex };
    if (f && f.pages && f.pages.length) {
        if (pageIndex < 0) pageIndex = f.pages.length - 1;
        pagedPending = null;
        ShowPage(f, pageIndex);
        CheckLoadPaged();
        return;
    }
    if (!f) frameList.push(CreateFrame(urlIndex, 0, CheckLoadPaged));
}

function AfterImages(frame, cb) {
    var doc = frame.contentDocument;
    if (!doc) { cb(); return; }
    var imgs = doc.getElementsByTagName("img");
    var pending = 0;
    var finished = false;
    function finish() {
        if (finished) return;
        finished = true;
        cb();
    }
    for (var i = 0; i < imgs.length; i++) {
        if (!imgs[i].complete) {
            pending++;
            imgs[i].addEventListener("load", function () { pending--; if (pending <= 0) finish(); });
            imgs[i].addEventListener("error", function () { pending--; if (pending <= 0) finish(); });
        }
    }
    var svgs = doc.getElementsByTagName("svg");
    for (var s = 0; s < svgs.length; s++) {
        var hrefs = svgs[s].querySelectorAll("image");
        for (var h = 0; h < hrefs.length; h++) {
            var src = hrefs[h].getAttribute("href") || hrefs[h].getAttribute("xlink:href") || "";
            if (!src) continue;
            pending++;
            var probe = new Image();
            probe.onload = function () { pending--; if (pending <= 0) finish(); };
            probe.onerror = function () { pending--; if (pending <= 0) finish(); };
            probe.src = src;
        }
    }
    if (pending <= 0) finish();
    else setTimeout(finish, 1200);
}

function OnPagedFrameLoaded(frame, isPosRate, pos, selector) {
    AfterImages(frame, function () {
        if (frame.discarded) return;
        direction.AdjustFrameSize(frame);
        CaptureImageNaturalSize(frame);
        ApplyPagedFrame(frame, isPosRate, pos, selector);
    });
}

function ApplyPagedFrame(frame, isPosRate, pos, selector) {
    var keepIndex = (currentFrame === frame && frame.pages && frame.pages.length > 1) ? frame.pageIndex : null;
    var keepOffset = (keepIndex != null && frame.pages[keepIndex]) ? frame.pages[keepIndex].charOffset : null;
    BuildPageTable(frame);
    if (keepOffset != null) {
        ShowPage(frame, PageIndexForCharOffset(frame, keepOffset));
        CheckLoadPaged();
        return;
    }
    if (keepIndex != null) {
        ShowPage(frame, keepIndex);
        CheckLoadPaged();
        return;
    }
    var want = pagedPending && pagedPending.urlIndex === frame.urlIndex;
    var idx = 0;
    if (selector || (want && pagedPending.selector)) {
        idx = PageIndexForSelector(frame, selector || pagedPending.selector);
        if (want) pagedPending = null;
    } else if (want) {
        if (typeof pagedPending.charOffset === "number") {
            idx = PageIndexForCharOffset(frame, pagedPending.charOffset);
        } else if (typeof pagedPending.pageIndexFromRate === "number") {
            idx = Math.round(pagedPending.pageIndexFromRate * frame.pages.length);
        } else {
            idx = pagedPending.pageIndex;
        }
        pagedPending = null;
        if (idx < 0) idx = frame.pages.length - 1;
        if (!(idx >= 0)) idx = 0;
    } else if (isPosRate) {
        idx = Math.round(pos * frame.pages.length);
    } else if (currentFrame && currentFrame !== frame) {
        if (currentFrame.imagePage && PartnerIndex(currentFrame) === frame.urlIndex) {
            ShowPage(currentFrame, currentFrame.pageIndex || 0);
            return;
        }
        frame.style.visibility = "hidden";
        return;
    }
    if (idx >= frame.pages.length) idx = frame.pages.length - 1;
    if (idx < 0) idx = 0;
    if (!currentFrame || want || isPosRate || selector || currentFrame === frame) {
        ShowPage(frame, idx);
        CheckLoadPaged();
    } else if (currentFrame.imagePage && PartnerIndex(currentFrame) === frame.urlIndex) {
        ShowPage(currentFrame, currentFrame.pageIndex || 0);
    } else {
        frame.style.visibility = "hidden";
    }
}

function TurnPage(dir) {
    if (!paged) return;
    var now = Date.now();
    if (now - pageTurnLock < 60) return;
    var f = currentFrame;
    if (!f) {
        CheckLoadPaged();
        return;
    }
    if (!f.pages || !f.pages.length) BuildPageTable(f);
    var idx = (typeof f.pageIndex === "number" ? f.pageIndex : 0) + (dir < 0 ? 1 : -1);
    if (f.pages && idx >= 0 && idx < f.pages.length) {
        pageTurnLock = now;
        ShowPage(f, idx);
        return;
    }
    if (dir < 0) {
        if (f.lastFrame) return;
        var pairIndex = PartnerIndex(f);
        var next = pairIndex != null && pairIndex > f.urlIndex ? pairIndex + 1 : f.urlIndex + 1;
        pageTurnLock = now;
        GoToChapterPage(next, 0);
    } else {
        if (f.firstFrame) return;
        var pairIndex = PartnerIndex(f);
        var prev = pairIndex != null && pairIndex < f.urlIndex ? pairIndex - 1 : f.urlIndex - 1;
        pageTurnLock = now;
        GoToChapterPage(prev, -1);
    }
}

function TogglePaged() {
    var idx = currentFrame ? currentFrame.urlIndex : 0;
    var rate = 0;
    if (currentFrame) {
        if (paged && currentFrame.pages && currentFrame.pages.length) {
            rate = currentFrame.pageIndex / currentFrame.pages.length;
        } else {
            var span = direction.GetParallelLength(currentFrame);
            if (span) rate = (-currentFrame.pos) / span;
            if (rate < 0) rate = 0;
        }
    }
    paged = !paged;
    document.paged = paged;
    UpdatePagedLabel();
    if (pageMask) pageMask.style.display = "none";
    ReleaseFrames();
    currentFrame = null;
    pagedPending = paged ? { urlIndex: idx, pageIndexFromRate: rate } : null;
    Init(urlList, idx, rate);
}

function ToggleDualPage() {
    dualPage = !dualPage;
    document.dualPage = dualPage;
    UpdateDualLabel();
    if (!paged) return;
    var f = currentFrame;
    if (!f) return;
    if (f.imagePage) ShowPage(f, f.pageIndex || 0);
    CheckLoadPaged();
}

function UpdatePagedLabel() {
    var el = document.getElementById("string_paged");
    if (!el) return;
    el.innerHTML = paged ? GetPagedString("scroll") : GetPagedString("paged");
    UpdateDualLabel();
}

function UpdateDualLabel() {
    var el = document.getElementById("string_dual");
    if (!el) return;
    el.innerHTML = dualPage ? GetPagedString("single") : GetPagedString("dual");
}

function GetPagedString(kind) {
    var lang = typeof currentLanguage === "number" ? currentLanguage : 0;
    if (kind === "scroll") return ["Scroll", "滾動", "スクロール"][lang] || "Scroll";
    if (kind === "single") return ["Single page", "單頁", "単ページ"][lang] || "Single page";
    if (kind === "dual") return ["Two-page", "雙頁", "見開き"][lang] || "Two-page";
    return ["Paginated", "分頁", "ページ"][lang] || "Paginated";
}

document.TurnPage = TurnPage;
document.ToggleDualPage = ToggleDualPage;
document.ImageAlign = ImageAlign;
document.PartnerIndex = PartnerIndex;
