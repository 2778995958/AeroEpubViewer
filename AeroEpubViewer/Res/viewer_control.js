document.addEventListener('contextmenu', event => event.preventDefault());

document.toolbarHotZoneRatio = 0.3;
document.IsViewerControlTarget = function (target) {
    while (target && target != document.body) {
        if (target.id == "menu" || target.id == "nav" || target.id == "navSwitch" || target.id == "context_menu") return true;
        if (target.classList && target.classList.contains("sp_frame_container")) return true;
        target = target.parentElement;
    }
    return false;
}
document.HandleViewerMouseUp = function (clientY, button, target) {
    if (button != 0) return;
    if (target && document.IsViewerControlTarget(target)) return;
    if (typeof document.TryCloseFootnote == "function" && document.TryCloseFootnote()) return;
    if (typeof document.TryCloseContextMenu == "function" && document.TryCloseContextMenu()) return;
    if (document.menuOn || document.navOn) {
        document.MenuClose();
        return;
    }
    if (clientY < window.innerHeight * document.toolbarHotZoneRatio) document.MenuOpen();
}
document.addEventListener("mouseup", function (e) {
    document.HandleViewerMouseUp(e.clientY, e.button, e.target);
});

document.Wheel = function (event) {
    if (document.readingMode && !paged) { ReadingWheel(event); return; }
    document.Scroll(Math.sign(event.wheelDelta) * 50);
}
document.getElementById("mouseListener").onmousewheel = function (e) {
    document.Wheel(e);
}
document.keydown = function (e) {
    if (e.ctrlKey) {
        switch (e.key) {
            case "f": SearchService(); break;

        }
    } else {
        switch (e.key) {
            case "PageDown":
                if (document.readingMode && !paged) ReadingNextPage(); else if (paged) Scroll(-1); else LongScroll(-0.8 * direction.GetWindowLength());
                break;
            case "PageUp":
                if (document.readingMode && !paged) ReadingPrevPage(); else if (paged) Scroll(1); else LongScroll(0.8 * direction.GetWindowLength());
                break;
            case "Home": DirectToIndex(GetCurrentChapterStartIndex()); break;
            case "End": DirectToIndex(GetNextChapterStartIndex()); break;
            case "ArrowDown":
            case "ArrowLeft":
            case "ArrowRight":
            case "ArrowUp":
                let d = direction.KeyToDirection(e.key);
                if (document.readingMode && !paged) {
                    if (d < 0) ReadingNextPage();
                    if (d > 0) ReadingPrevPage();
                } else {
                    Scroll(d * 30);
                }
                break;
        }
    }
};
document.addEventListener("keydown", document.keydown);

var touchPos = -1;
document.OnFrameTouchStart = function (x, y) {
    touchPos = direction.GetEffective(x, y);
};
document.OnFrameTouchMove = function (x, y) {
    let d = direction.GetEffective(x, y);
    let delta = direction.GetDelta(touchPos, d);
    Scroll(delta);
    touchPos = d;
};
document.OnFrameTouchEnd = function () {
    touchPos = -1;
};


var PrepareResize = function () {
    window.removeEventListener("resize", PrepareResize)
    var xhttp = new XMLHttpRequest();
    if (document.readingMode && !paged && typeof ReadingSerializeCurrentAnchor == "function")
        xhttp.open("GET", "aeroepub://domain/app/readingpos/" + ReadingSerializeCurrentAnchor(), true);
    else
        xhttp.open("GET", "aeroepub://domain/app/pos" + GetBookPos(), true);
    xhttp.send();
};
window.addEventListener("resize", PrepareResize);