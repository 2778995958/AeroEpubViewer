document.addEventListener('contextmenu', event => event.preventDefault());
function EnsureViewerFocus() {
    try { window.focus(); } catch (e) { }
    var b = document.body;
    if (b) {
        if (!b.hasAttribute("tabindex")) b.setAttribute("tabindex", "-1");
        try { b.focus(); } catch (e2) { }
    }
    if (typeof AppCall === "function") AppCall("aeroepub://domain/app/focus");
}
document.EnsureViewerFocus = EnsureViewerFocus;
function EventInNav(event) {
    if (!document.navOn) return false;
    var nav = document.getElementById("nav");
    var t = event && (event.target || event.srcElement);
    if (!nav || !t) return false;
    if (t === nav) return true;
    if (t.closest) return !!t.closest("#nav");
    while (t) {
        if (t === nav) return true;
        t = t.parentElement;
    }
    return false;
}
function OverlayFrame() {
    var g = document.getElementById("sp_frame_general_container");
    var s = document.getElementById("sp_frame_search_container");
    if (g && g.style.display === "block") return document.getElementById("sp_frame_general");
    if (s && s.style.display === "block") return document.getElementById("sp_frame_search");
    return null;
}
function ScrollOverlay(dy) {
    var f = OverlayFrame();
    if (!f || !dy) return false;
    try {
        var w = f.contentWindow;
        if (!w) return true;
        var se = (w.document && (w.document.scrollingElement || w.document.documentElement || w.document.body)) || null;
        if (se) se.scrollTop += dy;
        else w.scrollBy(0, dy);
    } catch (e) { }
    return true;
}
document.Wheel = function (event) {
    if (EventInNav(event)) return;
    var dy = 0;
    if (event) {
        if (typeof event.deltaY === "number" && event.deltaY !== 0) dy = event.deltaY;
        else if (typeof event.wheelDelta === "number" && event.wheelDelta !== 0) dy = -event.wheelDelta;
        else if (typeof event.detail === "number" && event.detail !== 0) dy = event.detail;
    }
    if (ScrollOverlay(dy)) {
        if (event && event.preventDefault) event.preventDefault();
        return;
    }
    if (event && event.preventDefault) event.preventDefault();
    if (typeof paged !== "undefined" && paged) {
        if (!dy) { EnsureViewerFocus(); return; }
        TurnPage(dy > 0 ? -1 : 1);
        EnsureViewerFocus();
        return;
    }
    let size = (document.userSettings && document.userSettings.bookFontSize) || 26;
    document.Scroll((dy > 0 ? -1 : 1) * size * 5);
    EnsureViewerFocus();
}
function BindWheel(el) {
    if (!el) return;
    var fn = function (e) { document.Wheel(e); };
    el.addEventListener("wheel", fn, { passive: false });
    el.addEventListener("mousewheel", fn, { passive: false });
    el.onmousewheel = fn;
}
BindWheel(document);
BindWheel(document.getElementById("mouseListener"));
BindWheel(document.body);
BindWheel(document.getElementById("pageMask"));
BindWheel(document.getElementById("openMask"));
BindWheel(document.getElementById("sp_frame_general_container"));
BindWheel(document.getElementById("sp_frame_search_container"));

function ViewerBlankClick(e) {
    if (!e || e.button != 0) return;
    if (document.TryCloseFootnote && document.TryCloseFootnote()) return;
    if (document.TryCloseContextMenu && document.TryCloseContextMenu()) return;
    if (document.menuOn || document.navOn) {
        document.MenuClose();
        return;
    }
    var y = e.clientY;
    if (y < window.innerHeight * 0.2) {
        document.MenuOpen();
        return;
    }
}
document.getElementById("mouseListener").onmouseup = ViewerBlankClick;
function IsTypingTarget(el) {
    if (!el) return false;
    var tag = (el.tagName || "").toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}
document.keydown = function (e) {
    var zoom = document.getElementById("imageZoom");
    if (zoom && zoom.style.display === "block") {
        if (e.key === "Escape" || e.key === "Enter") CloseZoomImage();
        else if (e.key === "ArrowDown") PanZoomImage(0, -48);
        else if (e.key === "ArrowUp") PanZoomImage(0, 48);
        else if (e.key === "ArrowRight") PanZoomImage(-48, 0);
        else if (e.key === "ArrowLeft") PanZoomImage(48, 0);
        if (e.preventDefault) e.preventDefault();
        return;
    }
    if (typeof OverlayFrame === "function" && OverlayFrame()) {
        if (e.key === "Escape") {
            try {
                var ow = OverlayFrame().contentWindow;
                if (ow && typeof ow.CloseLightbox === "function" && ow.document.getElementById("lightbox") && ow.document.getElementById("lightbox").style.display === "block") {
                    ow.CloseLightbox();
                    return;
                }
            } catch (x) { }
            document.CloseSpFrame();
            return;
        }
        try {
            var lw = OverlayFrame().contentWindow;
            if (lw && typeof lw.Step === "function" && lw.document.getElementById("lightbox") && lw.document.getElementById("lightbox").style.display === "block") {
                if (e.key === "ArrowLeft" || e.key === "PageUp") { lw.Step(-1); return; }
                if (e.key === "ArrowRight" || e.key === "PageDown") { lw.Step(1); return; }
                if (e.key === "Enter" || e.key === "g" || e.key === "G") { lw.JumpCurrent(); return; }
            }
        } catch (x2) { }
        return;
    }
    if ((e.key === "o" || e.key === "O") && !IsTypingTarget(e.target)) {
        OpenBook();
        return;
    }
    if (e.ctrlKey) {
        switch (e.key) {
            case "f": SearchService(); break;
            case "w": window.close(); break;

        }
    } else {
        switch (e.key) {
            case "PageDown":
                if (paged) TurnPage(-1);
                else LongScroll(-0.8 * direction.GetWindowLength());
                break;
            case "PageUp":
                if (paged) TurnPage(1);
                else LongScroll(0.8 * direction.GetWindowLength());
                break;
            case "Home": {
                let prevChapter = GetPreviousChapterStartIndex();
                if (!currentFrame || prevChapter != currentFrame.urlIndex) DirectToIndex(prevChapter);
                break;
            }
            case "End": {
                let nextChapter = GetNextChapterStartIndex();
                if (!currentFrame || nextChapter != currentFrame.urlIndex) DirectToIndex(nextChapter);
                break;
            }
            case "ArrowDown":
            case "ArrowLeft":
            case "ArrowRight":
            case "ArrowUp":
                let d = direction.KeyToDirection(e.key);
                if (paged) { if (d) TurnPage(d); }
                else Scroll(d * 30);
                break;
        }
    }
};
window.addEventListener("keydown", document.keydown, true);

var touchPos = -1;
var touchStart = -1;
document.OnFrameTouchStart = function (x, y) {
    touchPos = direction.GetEffective(x, y);
    touchStart = touchPos;
};
document.OnFrameTouchMove = function (x, y) {
    let d = direction.GetEffective(x, y);
    if (paged) {
        touchPos = d;
        return;
    }
    let delta = direction.GetDelta(touchPos, d);
    Scroll(delta);
    touchPos = d;
};
document.OnFrameTouchEnd = function () {
    if (paged && touchStart != -1 && touchPos != -1) {
        let delta = direction.GetDelta(touchStart, touchPos);
        if (Math.abs(delta) > 40) TurnPage(delta > 0 ? 1 : -1);
    }
    touchPos = -1;
    touchStart = -1;
};


var PrepareResize = function () {
    window.removeEventListener("resize", PrepareResize)
    var xhttp = new XMLHttpRequest();
    xhttp.open("GET", "aeroepub://domain/app/pos" + GetBookPos(), true);
    xhttp.send();
};
window.addEventListener("resize", PrepareResize);
