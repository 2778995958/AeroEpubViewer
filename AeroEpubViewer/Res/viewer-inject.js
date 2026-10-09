var PD = this.parent.document;
function OnFrameWheel(e) {
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    PD.Wheel(e);
    if (PD.EnsureViewerFocus) PD.EnsureViewerFocus();
    return false;
}
window.addEventListener("wheel", OnFrameWheel, true);
document.addEventListener("wheel", OnFrameWheel, { passive: false, capture: true });
document.addEventListener("mousewheel", OnFrameWheel, { passive: false, capture: true });
window.onmousewheel = OnFrameWheel;
document.onmousewheel = OnFrameWheel;
document.addEventListener("keydown", function (e) { PD.keydown(e); });
document.addEventListener('contextmenu', event => event.preventDefault());

[].forEach.call(document.body.querySelectorAll('[href]'), function (a) {
    a.onclick = function () { Href(a); event.stopPropagation(); return false; }
});

var selectionFlag = false;
document.body.onmouseup = function (e) {
    if (e.button == 0)//left click
    {
        let tryclose = PD.TryCloseFootnote() || PD.TryCloseContextMenu();
        if (tryclose) return;
        let sel = window.getSelection();
        if (sel.type == 'Range') {
            selectionFlag = true;
            return;
        }
        if (selectionFlag) {
            selectionFlag = false;
            return;
        }

        if (PD.menuOn || PD.navOn) {
            PD.MenuClose();
        } else {
            let top = (window.frameElement ? (window.frameElement.offsetTop || 0) : 0) + e.clientY;
            if (top < PD.defaultView.innerHeight * 0.2)
                PD.MenuOpen();
        }

    } else
        if (e.button == 2)//right
        {
            PD.ContextMenu(e.target, e.pageX, e.pageY, window.frameElement);
        }

};
var fontSizeStyle = document.createElement("style");
fontSizeStyle.innerHTML = "html{font-size:" + PD.userSettings.bookFontSize + "px}";
document.head.appendChild(fontSizeStyle);
var style = document.createElement("style");
style.innerHTML = PD.direction.injectStyle;
document.head.appendChild(style);
var themeStyle = document.createElement("style");
themeStyle.innerHTML = PD.theme.frameStyle;
document.head.appendChild(themeStyle);
FixImageOnlyPage();
document.addEventListener("touchstart", function (e) { PD.OnFrameTouchStart(e.touches[0].screenX, e.touches[0].screenY); });
document.addEventListener("touchend", function (e) { PD.OnFrameTouchEnd(); });
document.addEventListener("touchmove", function (e) { PD.OnFrameTouchMove(e.touches[0].screenX, e.touches[0].screenY); });
function AppendThemeQuery(url) {
    if (!url) return url;
    // 由 C# 產生的絕對網址（例如合成跨頁 SVG 的 <image>）已含正確路徑，
    // 這裡只負責附加 theme 與 cache-busting 參數，不重複加 "?"。
    if (url.indexOf("aeroepub://") === 0) {
        var q = url.indexOf("?");
        if (q >= 0) url = url.substring(0, q);
    }
    var sep = url.indexOf("?") >= 0 ? "&" : "?";
    return url + sep + PD.theme.name + "&g=" + (PD.bookGen || 0);
}
[].forEach.call(document.getElementsByTagName("img"), function (e) { e.src = AppendThemeQuery(e.src); });
[].forEach.call(document.getElementsByTagName("image"), function (e) {
    var href = e.getAttribute("xlink:href") || e.getAttribute("href") || "";
    if (!href) return;
    // 相對路徑需先轉絕對（瀏覽器自動解析），再附加參數
    if (href.indexOf("://") < 0) {
        var abs = new URL(href, document.baseURI || window.location.href).href;
        var next = AppendThemeQuery(abs);
    } else {
        var next = AppendThemeQuery(href);
    }
    e.setAttribute("xlink:href", next);
    e.setAttribute("href", next);
});

// SVG <image> 無法載入自訂 scheme，改用 <img> 標籤
// 只處理單一圖片的 SVG 頁面（固定版面 EPUB 常見結構）
var svgs = document.querySelectorAll("svg");
for (var i = 0; i < svgs.length; i++) {
    var images = svgs[i].querySelectorAll("image");
    if (images.length === 1 && images[0].parentElement === svgs[i]) {
        // 單一 <image> 直接在 <svg> 下
        var imgSrc = images[0].getAttribute("href") || images[0].getAttribute("xlink:href") || "";
        if (imgSrc && imgSrc.indexOf("aeroepub://") === 0) {
            var img = document.createElement("img");
            img.src = imgSrc;
            img.style.width = "100%";
            img.style.height = "100%";
            img.style.objectFit = "contain";
            img.style.display = "block";
            svgs[i].parentElement.replaceChild(img, svgs[i]);
        }
    }
}
function VisibleTextOnly() {
    let text = "";
    let walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
            let p = n.parentElement;
            if (!p) return NodeFilter.FILTER_REJECT;
            let tag = (p.tagName || "").toUpperCase();
            if (tag === "TITLE" || tag === "DESC" || tag === "SCRIPT" || tag === "STYLE" || tag === "RT") return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    }, false);
    while (walker.nextNode()) text += walker.currentNode.data;
    return text.replace(/\s+/g, "");
}
function FixImageOnlyPage() {
    let images = document.body.querySelectorAll("img");
    let svgs = document.body.querySelectorAll("svg");
    if (images.length + svgs.length != 1 || VisibleTextOnly() != "") return;
    // "meet" 會等比縮放並置中，SVG 因此不會填滿 iframe，
    // 左右各留下亞像素空隙，兩張配對頁並排時就會在接縫處露出底色。
    // "none" 讓 SVG 鋪滿整個 iframe，與 object-fit:fill 的圖片頁行為一致。
    var par = "none";
    [].forEach.call(svgs, function (s) { s.setAttribute("preserveAspectRatio", par); });
    var objPos = "center center";
    var fit = "fill";
    let style = document.createElement("style");
    style.innerHTML = "html,body,.main,div{width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;background:transparent!important;writing-mode:horizontal-tb!important;-webkit-writing-mode:horizontal-tb!important;} img,svg{position:fixed!important;left:0!important;top:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;display:block!important;object-fit:" + fit + "!important;object-position:" + objPos + "!important;}";
    document.head.appendChild(style);
}
function Href(e) {
    if (e.getAttribute("epub:type") == "noteref") {
        let noteid = e.href.split('#')[1];
        let note = document.getElementById(noteid);
        PD.PopupFootnote(note.innerHTML, e.offsetLeft, e.offsetTop, this.frameElement);
        return false;
    }
    PD.MenuClose();
    PD.Link(e.href);

}
document.body.oncopy = PD.FrameOnCopy;
function ZoomSrc(e) {
    var n = e.target;
    while (n && n !== document) {
        var tag = (n.tagName || "").toUpperCase();
        if (tag === "IMG") {
            var src = n.currentSrc || n.src || "";
            if (src) return src;
        }
        if (tag === "IMAGE") {
            var href = n.getAttribute("href") || n.getAttribute("xlink:href") || "";
            if (href) return AppendThemeQuery(href);
        }
        if (tag === "CANVAS") {
            var left = n.getAttribute("data-left");
            var right = n.getAttribute("data-right");
            if (left && right) {
                var lw = parseFloat(n.getAttribute("data-lw"));
                var lh = parseFloat(n.getAttribute("data-lh"));
                var rw = parseFloat(n.getAttribute("data-rw"));
                var rh = parseFloat(n.getAttribute("data-rh"));
                if (!(lw > 0) || !(rw > 0)) {
                    var split = parseFloat(n.getAttribute("data-split"));
                    if (!(split > 0 && split < 1)) split = 0.5;
                    lw = (n.width || 1) * split;
                    rw = (n.width || 1) - lw;
                    lh = rh = n.height || 1;
                }
                return {
                    spread: true,
                    left: AppendThemeQuery(left),
                    right: AppendThemeQuery(right),
                    lw: lw, lh: lh, rw: rw, rh: rh
                };
            }
        }
        n = n.parentElement;
    }
    return null;
}
document.addEventListener("dblclick", function (e) {
    var src = ZoomSrc(e);
    if (!src) return;
    if (src.spread) {
        if (!PD.ZoomSpread) return;
    } else if (!PD.ZoomImage) return;
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    if (src.spread) PD.ZoomSpread(src);
    else PD.ZoomImage(src);
}, true);