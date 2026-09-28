document.addEventListener('contextmenu', event => event.preventDefault());
document.Wheel = function (event) {
    if (event && event.preventDefault) event.preventDefault();
    var dy = 0;
    if (event) {
        if (typeof event.deltaY === "number" && event.deltaY !== 0) dy = event.deltaY;
        else if (typeof event.wheelDelta === "number" && event.wheelDelta !== 0) dy = -event.wheelDelta;
        else if (typeof event.detail === "number" && event.detail !== 0) dy = event.detail;
    }
    if (typeof paged !== "undefined" && paged) {
        if (!dy) return;
        TurnPage(dy > 0 ? -1 : 1);
        return;
    }
    let size = (document.userSettings && document.userSettings.bookFontSize) || 26;
    document.Scroll((dy > 0 ? -1 : 1) * size * 5);
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
BindWheel(document.getElementById("menuHit"));

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
document.getElementById("menuHit").onmouseup = ViewerBlankClick;
document.getElementById("mouseListener").onmouseup = ViewerBlankClick;
document.keydown = function (e) {
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
document.addEventListener("keydown", document.keydown);

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
