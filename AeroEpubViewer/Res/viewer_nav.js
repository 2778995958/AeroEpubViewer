function LoadTocNcx(data, path) {  ///will be called from C#
    let nav = document.getElementById("nav");
    nav.innerHTML = data;
    let navPionts = nav.getElementsByTagName("navPoint");
    [].forEach.call(navPionts, function (p) {
        let label = p.getElementsByTagName("navLabel")[0];
        let content = p.getElementsByTagName("content")[0];
        label.onclick = function () {
            Link(path + "/" + content.getAttribute("src"));
            NavSwitch();
            document.MenuClose();
        }
    });
}
function LoadTocNav(data, path) {///will be called from C#
    let nav = document.getElementById("nav");
    nav.innerHTML = data;
    var checkchild = function (e) {
        if (e.getAttribute("hraf")) {
            let p = path + "/" + e.getAttribute("hraf");
            e.onclick = function () {
                Link(p);
                NavSwitch();
                document.MenuClose();
            }
            e.removeAttribute("hraf");
        }
        [].forEach.call(e.children, checkchild);
    }
    checkchild(nav);
}

document.Link = Link;
function Link(url, _selector = null) {
    if (url.startsWith("http://") || url.startsWith("https://")) {
        AppCall("aeroepub://domain/app/External/" + encodeURIComponent(url));
    }
    let fullurl = url;
    if (fullurl.indexOf("/../") > 0) {
        let i = fullurl.indexOf("/../");
        let j = i;
        do {
            j--;
            if (j < 0) { console.log("error"); return; }
        } while (fullurl[j] != '/');
        fullurl = fullurl.substring(0, j) + fullurl.substring(i + 3);
    }
    if (fullurl.indexOf("aeroepub") != 0)
        fullurl = "aeroepub://domain/" + ("book/" + fullurl).replace("//", "/");
    let split_temp = fullurl.split('#');
    let path = split_temp[0];
    let selector = null;
    if (_selector) selector = _selector;
    else if (split_temp.length > 1) selector = "#" + split_temp[1];

    console.log("Linkto:" + fullurl);
    for (var i = 0; i < urlList.length; i++) {

        if (urlList[i] == path) { DirectToIndex(i, selector); return; }

    }
    console.log("Cannot link to " + url);
}
function FinishLoad(e) {
    if (!e || !e.pendingLoad) return;
    e.pendingLoad = false;
    if (typeof loading === "number" && loading > 0) loading--;
}
function LoadingBusy() {
    if (typeof loading !== "number" || loading <= 0) return false;
    for (let i = 0; i < frameList.length; i++) {
        if (frameList[i].pendingLoad) return true;
    }
    loading = 0;
    return false;
}
function DropFrame(e) {
    if (!e) return;
    e.discarded = true;
    FinishLoad(e);
    e.onload = null;
    if (e.parentNode) e.parentNode.removeChild(e);
}
function ReleaseFrames() {
    if (typeof longScrollTimerHandle !== "undefined" && longScrollTimerHandle != null) {
        clearInterval(longScrollTimerHandle);
        longScrollTimerHandle = null;
        longScrollRest = 0;
    }
    frameList.forEach(DropFrame);
    frameList = new Array();
    currentFrame = null;
    if (typeof pagedPending !== "undefined") pagedPending = null;
}
function DirectToIndex(urlIndex, selector) {
    if (!(urlIndex >= 0) || urlIndex >= urlList.length) return;
    ReleaseFrames();
    pagedPending = paged ? { urlIndex: urlIndex, pageIndex: 0, selector: selector || null } : null;
    Init(urlList, urlIndex, 0, selector, spreadList);
    ScrollBarShow();
}