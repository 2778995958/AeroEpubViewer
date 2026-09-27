document.addEventListener('contextmenu', event => event.preventDefault());
document.Wheel = function (event) {
    let size = (document.userSettings && document.userSettings.bookFontSize) || 18;
    document.Scroll(Math.sign(event.wheelDelta) * size * 5);
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
            case "PageDown": LongScroll(-0.8 * direction.GetWindowLength()); break;
            case "PageUp": LongScroll(0.8 * direction.GetWindowLength()); break;
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
                Scroll(d * 30);
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
    xhttp.open("GET", "aeroepub://domain/app/pos" + GetBookPos(), true);
    xhttp.send();
};
window.addEventListener("resize", PrepareResize);