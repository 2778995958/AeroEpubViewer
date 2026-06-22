var readingBusy = false;
var readingPageGap = 72;
var pendingReadingAnchor = null;

function ReadingSetPendingAnchor(anchorJson) {
    if (!anchorJson) return;
    try { pendingReadingAnchor = JSON.parse(decodeURIComponent(anchorJson)); }
    catch (e) { console.warn("Bad reading anchor", e); }
}

function ReadingTryRestorePendingAnchor() {
    if (!document.readingMode || pendingReadingAnchor == null) return;
    let anchor = pendingReadingAnchor;
    pendingReadingAnchor = null;
    ReadingRestoreAnchor(anchor);
}

function ReadingUpdateMasks() {
    let before = document.getElementById("readingMaskBefore");
    let after = document.getElementById("readingMaskAfter");
    if (before) before.style.display = "none";
    if (after) after.style.display = "none";
}

function ReadingNextPage() {
    if (paged) { Scroll(-1); return; }
    if (readingBusy || loading) return;
    readingBusy = true;
    try {
        let frame = currentFrame || frameList[0];
        if (!frame) return;
        ReadingEnsurePagination(frame);
        let index = ReadingGetCurrentStopIndex(frame);
        if (index < frame.readingPagination.stops.length - 1) {
            ReadingMoveToPageStop(frame, frame.readingPagination.stops[index + 1], index + 1);
            return;
        }
        ReadingMoveToNextFrameStart(frame);
    } finally {
        readingBusy = false;
    }
}

function ReadingPrevPage() {
    if (paged) { Scroll(1); return; }
    if (readingBusy || loading) return;
    readingBusy = true;
    try {
        let frame = currentFrame || frameList[0];
        if (!frame) return;
        ReadingEnsurePagination(frame);
        let index = ReadingGetCurrentStopIndex(frame);
        if (index > 0) {
            ReadingMoveToPageStop(frame, frame.readingPagination.stops[index - 1], index - 1);
            return;
        }
        ReadingMoveToPrevFrameEnd(frame);
    } finally {
        readingBusy = false;
    }
}

function ReadingWheel(event) {
    let d = ReadingGetWheelDirection(event);
    if (d == 0) return;
    setTimeout(function () {
        if (d < 0) ReadingNextPage(); else if (d > 0) ReadingPrevPage();
    }, 10);
}

function ReadingGetWheelDirection(event) {
    if (event.wheelDelta) return Math.sign(event.wheelDelta);
    if (event.deltaY) return -Math.sign(event.deltaY);
    return 0;
}

function ReadingEnsurePagination(frame) {
    if (!frame) return;
    let frameLength = direction.GetParallelLength(frame);
    let windowLength = direction.GetWindowLength();
    let pageLength = ReadingGetPageLength(frame);
    let p = frame.readingPagination;
    if (p && p.builtForFrameLength == frameLength && p.builtForWindowLength == windowLength && p.pageLength == pageLength) return;
    frame.readingPagination = ReadingBuildPagination(frame);
}

function ReadingBuildPagination(frame) {
    let blocks = ReadingBuildBlocks(frame);
    let pageLength = ReadingGetPageLength(frame);
    return {
        urlIndex: frame.urlIndex,
        pageLength: pageLength,
        blocks: blocks,
        stops: ReadingBuildPageStops(frame, blocks, pageLength),
        builtForWindowLength: direction.GetWindowLength(),
        builtForFrameLength: direction.GetParallelLength(frame)
    };
}

function ReadingBuildBlocks(frame) {
    let blocks = ReadingBuildTextLineBlocks(frame).concat(ReadingBuildImageBlocks(frame));
    blocks.sort(function (a, b) {
        if (Math.abs(a.start - b.start) > 1) return a.start - b.start;
        return a.end - b.end;
    });
    return ReadingMergeCloseLineBlocks(blocks);
}

function ReadingBuildTextLineBlocks(frame) {
    let blocks = [];
    let doc = frame.contentDocument;
    let nodes = ReadingGetTextNodes(doc);
    for (let i = 0; i < nodes.length; i++) {
        let node = nodes[i];
        let range = doc.createRange();
        range.selectNodeContents(node);
        let rects = range.getClientRects();
        for (let j = 0; j < rects.length; j++) {
            let rect = ReadingInflateLineContentRect(frame, rects[j]);
            if (rect.width < 0.5 || rect.height < 0.5) continue;
            let anchor = ReadingGetLineAnchorFromRect(frame, node, rects[j]);
            if (!anchor) continue;
            blocks.push({
                type: "line",
                start: ReadingRectLogicalStart(frame, rect),
                end: ReadingRectLogicalEnd(frame, rect),
                anchor: anchor,
                node: node,
                rect: rect
            });
        }
    }
    return blocks;
}

function ReadingBuildImageBlocks(frame) {
    let blocks = [];
    let doc = frame.contentDocument;
    let elements = doc.body.querySelectorAll("img,svg");
    let pageLength = ReadingGetPageLength(frame);
    for (let i = 0; i < elements.length; i++) {
        let e = elements[i];
        if (!ReadingIsVisibleElement(doc, e)) continue;
        let rect = e.getBoundingClientRect();
        if (!rect || rect.width < 0.5 || rect.height < 0.5) continue;
        let start = ReadingRectLogicalStart(frame, rect);
        let end = ReadingRectLogicalEnd(frame, rect);
        let length = end - start;
        if (length < 0.5) continue;
        blocks.push({
            type: length > pageLength + 1 ? "oversize-image" : "image",
            start: start,
            end: end,
            anchor: { urlIndex: frame.urlIndex, path: ReadingNodeToPath(doc.body, e), offset: 0, image: true },
            element: e,
            rect: rect
        });
    }
    return blocks;
}

function ReadingMergeCloseLineBlocks(blocks) {
    let result = [];
    for (let i = 0; i < blocks.length; i++) {
        let b = blocks[i];
        if (b.end <= b.start) continue;
        let last = result.length > 0 ? result[result.length - 1] : null;
        if (last && last.type == "line" && b.type == "line" && Math.abs(last.start - b.start) <= 2) {
            last.end = Math.max(last.end, b.end);
            continue;
        }
        result.push(b);
    }
    return result;
}

function ReadingBuildPageStops(frame, blocks, pageLength) {
    let stops = [];
    if (blocks.length == 0) {
        stops.push(ReadingCreatePageStop(frame, 0, 0, 0, null, "empty-frame"));
        return stops;
    }
    let i = 0;
    while (i < blocks.length) {
        let startBlock = blocks[i];
        let pageStart = Math.max(0, startBlock.start);
        let pageEndLimit = pageStart + pageLength;
        let lastFit = -1;
        let j = i;
        while (j < blocks.length) {
            let b = blocks[j];
            if (b.start < pageStart - 1) { j++; continue; }
            if (b.end <= pageEndLimit + 1) {
                lastFit = j;
                j++;
                continue;
            }
            break;
        }
        if (lastFit < i) lastFit = i;
        let reason = startBlock.type == "oversize-image" ? "oversize-image" : "normal";
        stops.push(ReadingCreatePageStop(frame, pageStart, blocks[lastFit].end, i, lastFit, reason, startBlock.anchor));
        i = lastFit + 1;
    }
    if (stops.length > 0 && stops[stops.length - 1].reason == "normal") stops[stops.length - 1].reason = "last-content";
    return stops;
}

function ReadingCreatePageStop(frame, logicalStart, logicalEnd, startBlockIndex, endBlockIndex, reason, anchor) {
    return {
        urlIndex: frame.urlIndex,
        logicalStart: logicalStart,
        logicalEnd: logicalEnd,
        targetPos: -logicalStart,
        startBlockIndex: startBlockIndex,
        endBlockIndex: endBlockIndex,
        anchor: anchor || { urlIndex: frame.urlIndex, path: null, offset: 0 },
        reason: reason || "normal"
    };
}

function ReadingGetFrameVisibleRange(frame) {
    let frameLength = direction.GetParallelLength(frame);
    let viewportLength = direction.GetWindowLength();
    let start = Math.max(0, -frame.pos);
    let end = Math.min(frameLength, viewportLength - frame.pos);
    if (end < start) end = start;
    return { start: start, end: end, length: Math.max(1, end - start), frameLength: frameLength, viewportLength: viewportLength };
}

function ReadingGetCurrentLogicalStart(frame) {
    return ReadingGetFrameVisibleRange(frame).start;
}

function ReadingFindNextStopIndex(frame) {
    ReadingEnsurePagination(frame);
    let stops = frame.readingPagination.stops;
    let current = ReadingGetCurrentLogicalStart(frame);
    let epsilon = 2;
    for (let i = 0; i < stops.length; i++) {
        if (stops[i].logicalStart > current + epsilon) return i;
    }
    return -1;
}

function ReadingFindPrevStopIndex(frame) {
    ReadingEnsurePagination(frame);
    let stops = frame.readingPagination.stops;
    let current = ReadingGetCurrentLogicalStart(frame);
    let epsilon = 2;
    for (let i = stops.length - 1; i >= 0; i--) {
        if (stops[i].logicalStart < current - epsilon) return i;
    }
    return -1;
}

function ReadingFindSerializeStopIndex(frame) {
    ReadingEnsurePagination(frame);
    return ReadingFindStopIndexForLogicalPos(frame, ReadingGetCurrentLogicalStart(frame));
}

function ReadingFindCurrentStopIndex(frame) {
    return ReadingFindSerializeStopIndex(frame);
}

function ReadingFindStopIndexForLogicalPos(frame, logicalPos) {
    ReadingEnsurePagination(frame);
    let stops = frame.readingPagination.stops;
    let index = 0;
    for (let i = 0; i < stops.length; i++) {
        if (stops[i].logicalStart <= logicalPos + 1) index = i;
        else break;
    }
    return index;
}

function ReadingMoveToPageStop(frame, stop, index) {
    if (!frame || !stop) return;
    let target = ReadingClampFramePos(frame, stop.targetPos);
    let delta = target - frame.pos;
    if (Math.abs(delta) > 1) Scroll(delta);
    if (index == null) index = ReadingFindStopIndexForLogicalPos(frame, stop.logicalStart);
    frame.readingCurrentStopIndex = index;
    ReadingApplyPageEndMask(frame, stop);
    if (Math.abs(frame.pos - target) > 2) console.warn("Reading page stop clamped", stop, frame.pos);
}

function ReadingGetCurrentStopIndex(frame) {
    ReadingEnsurePagination(frame);
    let stops = frame.readingPagination.stops;
    if (frame.readingCurrentStopIndex != null && frame.readingCurrentStopIndex >= 0 && frame.readingCurrentStopIndex < stops.length) return frame.readingCurrentStopIndex;
    let index = ReadingFindSerializeStopIndex(frame);
    frame.readingCurrentStopIndex = index;
    return index;
}

function ReadingApplyPageEndMask(frame, stop) {
    let before = document.getElementById("readingMaskBefore");
    let after = document.getElementById("readingMaskAfter");
    if (before) before.style.display = "none";
    if (!after || !frame || !stop) return;
    let pageLength = ReadingGetPageLength(frame);
    let contentLength = Math.max(0, Math.min(pageLength, stop.logicalEnd - stop.logicalStart));
    let maskLength = Math.ceil(pageLength - contentLength);
    if (maskLength <= 1) {
        after.style.display = "none";
        return;
    }
    after.style.display = "block";
    after.style.position = "fixed";
    after.style.zIndex = 6;
    after.style.pointerEvents = "none";
    after.style.background = window.getComputedStyle(document.body, null).backgroundColor || "white";
    after.style.right = "";
    after.style.bottom = "";
    if (direction == direction_rtl) {
        after.style.left = "0";
        after.style.top = "0";
        after.style.width = maskLength + "px";
        after.style.height = "100vh";
    } else {
        after.style.left = "0";
        after.style.top = contentLength + "px";
        after.style.width = "100vw";
        after.style.height = maskLength + "px";
    }
}

function ReadingClampFramePos(frame, pos) {
    let frameLength = direction.GetParallelLength(frame);
    let viewportLength = direction.GetWindowLength();
    if (frameLength <= viewportLength) return 0;
    let minPos = viewportLength - frameLength;
    return Math.max(minPos, Math.min(0, pos));
}

function ReadingGetFirstContentStop(frame) {
    ReadingEnsurePagination(frame);
    let stops = frame.readingPagination.stops;
    for (let i = 0; i < stops.length; i++) {
        if (stops[i].reason != "empty-frame") return stops[i];
    }
    return stops.length > 0 ? stops[0] : null;
}

function ReadingGetLastContentStop(frame) {
    ReadingEnsurePagination(frame);
    let stops = frame.readingPagination.stops;
    for (let i = stops.length - 1; i >= 0; i--) {
        if (stops[i].reason != "empty-frame") return stops[i];
    }
    return stops.length > 0 ? stops[stops.length - 1] : null;
}

function ReadingMoveToNextFrameStart(frame) {
    if (!frame || frame.urlIndex >= urlList.length - 1) return;
    pendingReadingAnchor = { urlIndex: frame.urlIndex + 1, path: null, offset: 0 };
    DirectToIndex(frame.urlIndex + 1);
}

function ReadingMoveToPrevFrameEnd(frame) {
    if (!frame || frame.urlIndex <= 0) return;
    pendingReadingAnchor = { urlIndex: frame.urlIndex - 1, path: null, offset: -1 };
    DirectToIndex(frame.urlIndex - 1);
}

function ReadingGetPageGap() {
    return Math.max(12, Math.min(72, readingPageGap));
}

function ReadingGetPageLength(frame) {
    if (!frame) return Math.max(1, direction.GetWindowLength());
    return Math.max(1, Math.min(direction.GetWindowLength(), direction.GetParallelLength(frame)));
}

function ReadingFindNextPageAnchor(anchor) {
    if (!anchor) return ReadingFindNextFrameAnchor(0);
    let frame = ReadingGetFrame(anchor.urlIndex);
    if (!frame) return ReadingFindNextFrameAnchor(anchor.urlIndex + 1);
    ReadingEnsurePagination(frame);
    let pos = ReadingGetAnchorLogicalPos(frame, anchor);
    let index = ReadingFindStopIndexForLogicalPos(frame, pos);
    let stop = frame.readingPagination.stops[index + 1];
    return stop ? stop.anchor : ReadingFindNextFrameAnchor(frame.urlIndex + 1);
}

function ReadingFindPrevPageAnchor(anchor) {
    if (!anchor) return null;
    let frame = ReadingGetFrame(anchor.urlIndex);
    if (!frame) return ReadingFindPrevFrameAnchor(anchor.urlIndex - 1);
    ReadingEnsurePagination(frame);
    let pos = ReadingGetAnchorLogicalPos(frame, anchor);
    let index = ReadingFindStopIndexForLogicalPos(frame, pos);
    let stop = frame.readingPagination.stops[index - 1];
    return stop ? stop.anchor : ReadingFindPrevFrameAnchor(frame.urlIndex - 1);
}

function ReadingFindNextFrameAnchor(urlIndex) {
    if (urlIndex < urlList.length) return { urlIndex: urlIndex, path: null, offset: 0 };
    return null;
}

function ReadingFindPrevFrameAnchor(urlIndex) {
    if (urlIndex >= 0) return { urlIndex: urlIndex, path: null, offset: -1 };
    return null;
}

function ReadingRestoreAnchor(anchor) {
    if (!anchor) return;
    let frame = ReadingGetFrame(anchor.urlIndex);
    if (!frame) {
        pendingReadingAnchor = anchor;
        DirectToIndex(anchor.urlIndex);
        return;
    }
    ReadingEnsurePagination(frame);
    let stops = frame.readingPagination.stops;
    if (stops.length == 0) return;
    if (anchor.path == null && !anchor.image) {
        let stop = anchor.offset < 0 ? ReadingGetLastContentStop(frame) : ReadingGetFirstContentStop(frame);
        ReadingMoveToPageStop(frame, stop);
        return;
    }
    let logicalPos = ReadingGetAnchorLogicalPos(frame, anchor);
    ReadingMoveToPageStop(frame, stops[ReadingFindStopIndexForLogicalPos(frame, logicalPos)]);
}

function ReadingMoveToAnchor(anchor) {
    ReadingRestoreAnchor(anchor);
}

function ReadingGetCurrentPageStop() {
    let frame = currentFrame || frameList[0];
    if (!frame) return null;
    ReadingEnsurePagination(frame);
    return frame.readingPagination.stops[ReadingFindCurrentStopIndex(frame)] || null;
}

function ReadingSerializeCurrentAnchor() {
    let stop = ReadingGetCurrentPageStop();
    if (stop && stop.anchor) return encodeURIComponent(JSON.stringify(stop.anchor));
    return "";
}

function ReadingGetFrame(urlIndex) {
    for (let i = 0; i < frameList.length; i++) if (frameList[i].urlIndex == urlIndex) return frameList[i];
    return null;
}

function ReadingInflateLineContentRect(frame, rect) {
    let fontSize = 16;
    try {
        let e = frame.contentDocument.elementFromPoint(Math.max(1, rect.left + 1), Math.max(1, rect.top + 1));
        if (e) {
            let s = frame.contentWindow.getComputedStyle(e, null);
            fontSize = parseFloat(s.fontSize) || fontSize;
            let lineHeight = parseFloat(s.lineHeight);
            if (lineHeight > 0) fontSize = Math.max(fontSize, lineHeight);
        }
    } catch (e) { }
    let rubyExtra = fontSize * 0.75;
    if (direction == direction_rtl) {
        return { left: rect.left - rubyExtra, right: rect.right + rubyExtra, top: rect.top, bottom: rect.bottom, width: rect.width + rubyExtra * 2, height: rect.height };
    }
    return { left: rect.left, right: rect.right, top: rect.top - rubyExtra, bottom: rect.bottom + rubyExtra, width: rect.width, height: rect.height + rubyExtra * 2 };
}

function ReadingGetLineAnchorFromRect(frame, node, rect) {
    let doc = frame.contentDocument;
    let x = direction == direction_rtl ? rect.right - 1 : rect.left + 1;
    let y = rect.top + 1;
    x = Math.max(1, Math.min(frame.contentWindow.innerWidth - 1, x));
    y = Math.max(1, Math.min(frame.contentWindow.innerHeight - 1, y));
    if (doc.caretRangeFromPoint) {
        let caret = doc.caretRangeFromPoint(x, y);
        if (caret && caret.startContainer && caret.startContainer.nodeType == Node.TEXT_NODE && ReadingIsReadableTextNode(doc, caret.startContainer)) {
            return { urlIndex: frame.urlIndex, path: ReadingNodeToPath(doc.body, caret.startContainer), offset: caret.startOffset };
        }
    }
    return { urlIndex: frame.urlIndex, path: ReadingNodeToPath(doc.body, node), offset: ReadingFirstNonBlankOffset(node.nodeValue || "") };
}

function ReadingRectLogicalStart(frame, rect) {
    if (direction == direction_rtl) return frame.contentDocument.documentElement.scrollWidth - rect.right;
    return rect.top;
}

function ReadingRectLogicalEnd(frame, rect) {
    if (direction == direction_rtl) return frame.contentDocument.documentElement.scrollWidth - rect.left;
    return rect.bottom;
}

function ReadingGetAnchorLogicalPos(frame, anchor) {
    if (!anchor) return 0;
    if (anchor.path == null && !anchor.image) return anchor.offset < 0 ? direction.GetParallelLength(frame) : 0;
    if (anchor.image) {
        let e = ReadingPathToNode(frame.contentDocument.body, anchor.path);
        if (!e || !e.getBoundingClientRect) return 0;
        return ReadingRectLogicalStart(frame, e.getBoundingClientRect());
    }
    let node = ReadingPathToNode(frame.contentDocument.body, anchor.path);
    if (!node) return 0;
    let range = frame.contentDocument.createRange();
    let offset = Math.min(anchor.offset || 0, Math.max(0, node.nodeValue.length - 1));
    range.setStart(node, offset);
    range.setEnd(node, Math.min(offset + 1, node.nodeValue.length));
    let rect = range.getBoundingClientRect();
    return ReadingRectLogicalStart(frame, rect);
}

function ReadingIsVisibleElement(doc, e) {
    if (!e || !e.getBoundingClientRect) return false;
    while (e && e.nodeType == Node.ELEMENT_NODE) {
        let s = doc.defaultView.getComputedStyle(e, null);
        if (s.display == "none" || s.visibility == "hidden") return false;
        e = e.parentElement;
    }
    return true;
}

function ReadingIsReadableTextNode(doc, node) {
    if (!node || !node.nodeValue || node.nodeValue.trim() == "") return false;
    let e = node.parentElement;
    while (e) {
        let tag = e.tagName ? e.tagName.toLowerCase() : "";
        if (tag == "script" || tag == "style" || tag == "rt") return false;
        let s = doc.defaultView.getComputedStyle(e, null);
        if (s.display == "none" || s.visibility == "hidden") return false;
        e = e.parentElement;
    }
    return true;
}

function ReadingGetTextNodes(doc) {
    let result = [];
    let walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function (node) {
            return ReadingIsReadableTextNode(doc, node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
    });
    let n;
    while (n = walker.nextNode()) result.push(n);
    return result;
}

function ReadingFirstNonBlankOffset(text) {
    for (let i = 0; i < text.length; i++) if (" 　\r\n\t".indexOf(text[i]) < 0) return i;
    return 0;
}

function ReadingNodeToPath(root, node) {
    let path = [];
    while (node && node != root) {
        let parent = node.parentNode;
        if (!parent) break;
        let index = 0;
        for (let n = parent.firstChild; n && n != node; n = n.nextSibling) index++;
        path.unshift(index);
        node = parent;
    }
    return path;
}

function ReadingPathToNode(root, path) {
    if (!path) return null;
    let node = root;
    for (let i = 0; i < path.length; i++) {
        node = node.childNodes[path[i]];
        if (!node) return null;
    }
    return node;
}

function ReadingValidateCurrentPage(frame) {
    frame = frame || currentFrame || frameList[0];
    if (!frame) return;
    ReadingEnsurePagination(frame);
    let range = ReadingGetFrameVisibleRange(frame);
    let start = range.start;
    let end = range.end;
    let blocks = frame.readingPagination.blocks;
    for (let i = 0; i < blocks.length; i++) {
        let b = blocks[i];
        let intersects = b.end > start + 1 && b.start < end - 1;
        let contained = b.start >= start - 1 && b.end <= end + 1;
        if (intersects && !contained) console.warn("Reading page cuts block", b);
    }
}
