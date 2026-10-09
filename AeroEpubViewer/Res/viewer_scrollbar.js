var contentLengthData;
var contentChapterData;
var scrollBar;
var scrollBarDragging = false;
var scrollBarSetting = false;
var scrollBar_container = document.getElementById("scrollBar_container");
var scrollJumpHandle = null;
var scrollJumpValue = 0;
function SpreadFold() {
    return typeof paged !== "undefined" && paged && typeof dualPage !== "undefined" && dualPage && typeof spreadMates !== "undefined" && spreadMates;
}
function SpreadScrollWeight(i) {
    var len = (contentLengthData && contentLengthData[i]) || 0;
    if (!SpreadFold()) return len;
    var m = spreadMates[i];
    if (!(m >= 0)) return len;
    if (m < i) return 0;
    return len + ((contentLengthData[m]) || 0);
}
function SpreadScrollAnchor(i) {
    if (!SpreadFold()) return i;
    var m = spreadMates[i];
    if (!(m >= 0)) return i;
    return m < i ? m : i;
}
function RefreshScrollBarMax() {
    if (!scrollBar || !contentLengthData) return;
    var total = 0;
    var i;
    for (i = 0; i < contentLengthData.length; i++) total += SpreadScrollWeight(i);
    if (!(total > 0)) total = 1;
    scrollBarSetting = true;
    scrollBar.max = total;
    scrollBarSetting = false;
}
function JumpByScrollBarValue(v) {
    if (scrollBarSetting) return;
    if (!contentLengthData || !contentLengthData.length) return;
    v = +v;
    if (isNaN(v)) return;
    var start = 0;
    var chosen = 0;
    var rate = 0;
    var i;
    for (i = 0; i < contentLengthData.length; i++) {
        var w = SpreadScrollWeight(i);
        if (!(w > 0)) continue;
        if (v < start + w) {
            chosen = i;
            rate = (v - start) / w;
            break;
        }
        start += w;
        chosen = i;
        rate = 1;
    }
    if (rate < 0) rate = 0;
    if (rate > 1) rate = 1;
    var anchor = SpreadScrollAnchor(chosen);
    if (typeof JumpToSpine === "function" && JumpToSpine(anchor)) return;
    if (paged && currentFrame && currentFrame.urlIndex === anchor && !currentFrame.syntheticSpread && currentFrame.pages && currentFrame.pages.length) {
        var idx = Math.round(rate * currentFrame.pages.length);
        if (idx >= currentFrame.pages.length) idx = currentFrame.pages.length - 1;
        if (idx < 0) idx = 0;
        ShowPage(currentFrame, idx);
        return;
    }
    if (!paged && currentFrame != null && frameList.indexOf(currentFrame) >= 0 && currentFrame.urlIndex === anchor) {
        var span = direction.GetParallelLength(currentFrame);
        if (span > 0) {
            Scroll(-parseInt(rate * span) - currentFrame.pos);
            return;
        }
    }
    if (typeof LoadingBusy === "function" && LoadingBusy()) {
        scrollJumpValue = v;
        setTimeout(function () { JumpByScrollBarValue(scrollJumpValue); }, 60);
        return;
    }
    ReleaseFrames();
    Init(urlList, anchor, rate, "", spreadList);
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
        if (scrollBarSetting) return;
        scrollBarDragging = true;
        ScheduleScrollJump(scrollBar.value);
    };
    scrollBar.onchange = function () {
        if (scrollBarSetting) return;
        scrollBarDragging = false;
        scrollBar.blur();
        scrollJumpValue = scrollBar.value;
        JumpByScrollBarValue(scrollBar.value);
    };
    scrollBar_container.appendChild(scrollBar);
    RefreshScrollBarMax();

}
function SetScrollBar() {
    let v = 0;

    if (paged) {
        if (!currentFrame || !contentLengthData || !scrollBar) return;
        var idx = currentFrame.urlIndex;
        if (currentFrame.syntheticSpread && currentFrame.spreadPartnerIndex >= 0)
            idx = Math.min(idx, currentFrame.spreadPartnerIndex);
        idx = SpreadScrollAnchor(idx);
        var i = 0;
        for (; i < idx; i++) v += SpreadScrollWeight(i);
        var w = SpreadScrollWeight(idx);
        var paired = SpreadFold() && spreadMates[idx] >= 0 && (currentFrame.syntheticSpread || currentFrame.imagePage);
        if (paired) v += w * 0.5;
        else {
            let total = currentFrame.totalPage || (currentFrame.pages && currentFrame.pages.length) || 1;
            let num = currentFrame.pageIndex || 0;
            if (!(total > 0)) total = 1;
            v += (num / total) * w;
        }
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
    if (!scrollBarDragging) {
        scrollBarSetting = true;
        scrollBar.value = v;
        scrollBarSetting = false;
    }
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
    let p = direction.GetChromeEventPercent ? direction.GetChromeEventPercent(e) : direction.GetEventParallelPercent(e);
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
        var w = SpreadScrollWeight(i);
        if (!(w > 0)) continue;
        var name = contentChapterData[i] || "";
        var mate = SpreadFold() ? spreadMates[i] : -1;
        if (!name && mate > i && contentChapterData[mate]) name = contentChapterData[mate];
        if (name != "") {
            if (gotchapter) break;
            chaptername = name;
            chapterlength = 0;
            chapterpos = templength;
        }
        chapterlength += w;
        templength += w;
        if (templength > pos) {
            gotchapter = true;
        }
    }
    if (currentChapterName == "" || (currentChapterName != chaptername && currentChapterName != "")) {
        let pxmax = direction.GetChromeLength ? direction.GetChromeLength() : direction.GetParallelLength(scrollBar_container);
        if (direction.SetChromePos) direction.SetChromePos(scrollBarChapterDisplay, chapterpos / scrollBar.max * pxmax);
        else direction.SetParallelPositivePos(scrollBarChapterDisplay, chapterpos / scrollBar.max * pxmax);
        if (direction.SetChromeLength) direction.SetChromeLength(scrollBarChapterDisplay, chapterlength / scrollBar.max * pxmax);
        else direction.SetParallelLength(scrollBarChapterDisplay, chapterlength / scrollBar.max * pxmax);
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
