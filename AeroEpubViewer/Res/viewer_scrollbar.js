var contentLengthData;
var contentChapterData;
var scrollBar;
var scrollBarDragging = false;
var scrollBar_container = document.getElementById("scrollBar_container");
var scrollJumpHandle = null;
var scrollJumpValue = 0;
function JumpByScrollBarValue(v) {
    if (LoadingBusy()) {
        setTimeout(function () { JumpByScrollBarValue(scrollJumpValue); }, 60);
        return;
    }
    let s = 0;
    for (let i = 0; i < contentLengthData.length; i++) {
        s += contentLengthData[i];
        if (s >= v) {
            let rate = (v - s + contentLengthData[i]) / contentLengthData[i];
            if (!paged && currentFrame != null && frameList.indexOf(currentFrame) >= 0 && currentFrame.urlIndex == i) {
                let span = direction.GetParallelLength(currentFrame);
                if (span > 0) {
                    Scroll(-parseInt(rate * span) - currentFrame.pos);
                    return;
                }
            }
            ReleaseFrames();
            Init(urlList, i, rate);
            return;
        }
    }
    console.log("DEBUG:shouldnt be here");
}
function ScheduleScrollJump(v) {
    scrollJumpValue = v;
    if (scrollJumpHandle != null) return;
    scrollJumpHandle = requestAnimationFrame(function () {
        scrollJumpHandle = null;
        JumpByScrollBarValue(scrollJumpValue);
    });
}
function LoadScrollBar(arr, plain) {
    contentLengthData = arr;
    contentChapterData = plain;
    //console.log(arr.length == plain.length);
    let total = 0;
    for (let i = 0; i < contentLengthData.length; i++)
        total += contentLengthData[i];
    scrollBar = document.createElement("input");
    scrollBar.id = "scrollBar";
    scrollBar.type = "range";
    scrollBar.min = 0;
    scrollBar.max = total;
    scrollBar.step = 1;
    scrollBar.onmousedown = function () { scrollBarDragging = true; };
    scrollBar.onmouseup = function () { scrollBarDragging = false; };
    scrollBar.ontouchstart = function () { scrollBarDragging = true; };
    scrollBar.ontouchend = function () { scrollBarDragging = false; };
    scrollBar.oninput = function () {
        scrollBarDragging = true;
        ScheduleScrollJump(scrollBar.value);
    };
    scrollBar.onchange = function () {
        scrollBarDragging = false;
        scrollBar.blur();
        JumpByScrollBarValue(scrollBar.value);
    };
    scrollBar_container.appendChild(scrollBar);

}
function SetScrollBar() {
    let v = 0;

    if (paged) {
        if (!frameList.length) return;
        let i = 0;
        for (; i < frameList[0].urlIndex; i++)
            v += contentLengthData[i];
        v += frameList[0].num / frameList[0].totalPage * contentLengthData[i];
    }
    else {
        if (!currentFrame || frameList.indexOf(currentFrame) < 0) return;
        let i = 0;
        for (; i < currentFrame.urlIndex; i++)
            v += contentLengthData[i];
        let span = direction.GetParallelLength(currentFrame);
        if (!span) return;
        v += (-currentFrame.pos) * contentLengthData[i] / span;
    }
    if (!scrollBarDragging) scrollBar.value = v;
}
var scrollBarFadeHandle = null;
var scrollBarChapterDisplay = document.getElementById("scrollBarChapterDisplay");
function ScrollBarMouseEnter(e) {
    clearTimeout(scrollBarFadeHandle);
    scrollBar_container.style.animation = "";
    scrollBar_container.style.opacity = "1";
}
function ScrollBarMouseLeave(e) {
    scrollBarFadeHandle = setTimeout(function () {
        scrollBar_container.style.animation = "fadeOut 0.5s ease 0s 1";
        scrollBar_container.style.animationFillMode = "forwards";
    }, 2000);
    scrollBarChapterDisplay.children[0].innerHTML = "";
    currentChapterName = "";
}
function ScrollBarMouseMove(e) {
    let p = direction.GetEventParallelPercent(e);
    ScrollBarChapterDisplay(p);
}
var currentChapterName = "";
function ScrollBarChapterDisplay(p) {
    let pos = scrollBar.max * p;
    let chaptername = "";
    let chapterlength = 0;
    let chapterpos = 0;
    let templength = 0;
    let gotchapter = false;
    for (let i = 0; i < contentLengthData.length; i++) {
        if (contentChapterData[i] != "") {
            if (gotchapter) break;
            chaptername = contentChapterData[i];
            chapterlength = 0;
            chapterpos = templength;
        }
        chapterlength += contentLengthData[i];
        templength += contentLengthData[i];
        if (templength > pos) {
            gotchapter = true;
        }
    }
    if (currentChapterName == "" || (currentChapterName != chaptername && currentChapterName != "")) {
        let pxmax = direction.GetParallelLength(scrollBar_container);
        direction.SetParallelPositivePos(scrollBarChapterDisplay, chapterpos / scrollBar.max * pxmax);
        direction.SetParallelLength(scrollBarChapterDisplay, chapterlength / scrollBar.max * pxmax);
        currentChapterName = chaptername;
        scrollBarChapterDisplay.children[0].innerHTML = chaptername;
    }

}
function ScrollBarShow() {
    clearTimeout(scrollBarFadeHandle);
    scrollBar_container.style.animation = "";
    scrollBar_container.style.opacity = "1";
    scrollBarFadeHandle = setTimeout(function () {
        scrollBar_container.style.animation = "fadeOut 0.5s ease 0s 1";
        scrollBar_container.style.animationFillMode = "forwards";
    }, 2000);
}
