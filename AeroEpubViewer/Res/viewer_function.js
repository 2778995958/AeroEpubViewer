function CopyImage(url) {
    let q = url.indexOf("?");
    if (q >= 0) url = url.substring(0, q);
    let mark = "/book/";
    let i = url.indexOf(mark);
    let path = i >= 0 ? url.substring(i + mark.length) : url;
    AppCall("aeroepub://domain/app/CopyImage/" + path);
    document.TryCloseContextMenu();
}
function CopyCanvas() {
    // 找到 Canvas 元素（從 tempTargetElement 開始往上找）
    let canvas = tempTargetElement;
    while (canvas && canvas.tagName && canvas.tagName.toUpperCase() !== "CANVAS") {
        canvas = canvas.parentElement;
    }

    if (canvas && canvas.tagName && canvas.tagName.toUpperCase() === "CANVAS") {
        // 將 Canvas 轉為 Blob 並使用臨時的全域變數傳遞
        try {
            canvas.toBlob(function(blob) {
                let reader = new FileReader();
                reader.onload = function() {
                    // 將 Base64 資料暫存到全域變數
                    window.__canvasImageData = reader.result;
                    // 通知 C# 端來讀取
                    AppCall("aeroepub://domain/app/CopyCanvasImage");
                };
                reader.readAsDataURL(blob);
            }, 'image/png');
        } catch(err) {
            console.error('Canvas copy failed:', err);
        }
    }
    document.TryCloseContextMenu();
}
function InspectElement() {
    console.log(tempTargetElement);
    Inspector();
    document.TryCloseContextMenu();
}

function SetTheme() {
    let name = document.getElementById("themeSelect").value;
    gen_theme_warm(document.userSettings.warmColor);
    switch (name) { case "default": document.theme = theme_default; break; case "warm": document.theme = theme_warm; break; case "dark": document.theme = theme_dark; break; }
    for (let i = 0; i < frameList.length; i++) { frameList[i].contentWindow.location.reload(); }
    themeStyle.innerHTML = document.theme.viewerStyle;
    AppCall("aeroepub://domain/app/theme/" + name);
}

function ApplyFontSize(a) {
    document.userSettings.bookFontSize = parseInt(a);
    AppCall("aeroepub://domain/app/pos" + GetBookPos());
    AppCall("aeroepub://domain/app/bookfontsize/" + document.userSettings.bookFontSize);
}
function Inspector() {
    AppCall("aeroepub://domain/app/inspector");
}
function ScreenTest() {
    let e = document.getElementById("screenTest");
    AppCall("aeroepub://domain/app/screentest/" + e.offsetWidth + "/" + e.offsetHeight);
}
function OpenBook() {
    document.MenuClose();
    AppCall("aeroepub://domain/app/open");
}
function ShowOpenMask() {
    if (document.CloseSpFrame) {
        try { document.CloseSpFrame(); } catch (e) { }
    }
    document.MenuClose();
    var m = document.getElementById("openMask");
    if (m) m.style.display = "flex";
}
function HideOpenMask() {
    var m = document.getElementById("openMask");
    if (m) m.style.display = "none";
}
var zoomScale = 1;
var zoomX = 0;
var zoomY = 0;
var zoomNatW = 1;
var zoomNatH = 1;
var zoomLayout = null;
var zoomToken = 0;
function ZoomFitScale(box) {
    var fit = Math.min(box.clientWidth / (zoomNatW || 1), box.clientHeight / (zoomNatH || 1));
    if (!isFinite(fit) || fit <= 0) fit = 1;
    return fit;
}
function PlaceZoomImage() {
    var img = document.getElementById("imageZoomImg");
    var imgR = document.getElementById("imageZoomImgR");
    if (!img) return;
    if (!zoomLayout) {
        if (!img.naturalWidth) return;
        img.style.display = "block";
        img.style.width = Math.max(1, zoomNatW * zoomScale) + "px";
        img.style.height = Math.max(1, zoomNatH * zoomScale) + "px";
        img.style.left = zoomX + "px";
        img.style.top = zoomY + "px";
        if (imgR) imgR.style.display = "none";
        return;
    }
    var L = zoomLayout;
    img.style.display = "block";
    img.style.width = Math.max(1, L.lw * zoomScale) + "px";
    img.style.height = Math.max(1, L.lh * zoomScale) + "px";
    img.style.left = zoomX + "px";
    img.style.top = zoomY + "px";
    if (!imgR) return;
    imgR.style.display = "block";
    imgR.style.width = Math.max(1, L.rw * zoomScale) + "px";
    imgR.style.height = Math.max(1, L.rh * zoomScale) + "px";
    imgR.style.left = (zoomX + L.lw * zoomScale) + "px";
    imgR.style.top = zoomY + "px";
}
function CenterZoom(box) {
    zoomScale = ZoomFitScale(box);
    zoomX = (box.clientWidth - zoomNatW * zoomScale) / 2;
    zoomY = (box.clientHeight - zoomNatH * zoomScale) / 2;
    PlaceZoomImage();
}
function OpenZoomBox() {
    if (document.MenuClose) document.MenuClose();
    if (document.TryCloseContextMenu) document.TryCloseContextMenu();
    var box = document.getElementById("imageZoom");
    if (box) box.style.display = "block";
    return box;
}
function ZoomImage(url) {
    var box = document.getElementById("imageZoom");
    var img = document.getElementById("imageZoomImg");
    var imgR = document.getElementById("imageZoomImgR");
    if (!box || !img || !url) return;
    var token = ++zoomToken;
    zoomLayout = null;
    if (imgR) imgR.style.display = "none";
    OpenZoomBox();
    img.onload = function () {
        if (token !== zoomToken) return;
        zoomNatW = img.naturalWidth || 1;
        zoomNatH = img.naturalHeight || 1;
        CenterZoom(box);
    };
    img.src = url;
    if (img.complete && img.naturalWidth) img.onload();
}
function ZoomSpread(info) {
    var box = document.getElementById("imageZoom");
    var img = document.getElementById("imageZoomImg");
    var imgR = document.getElementById("imageZoomImgR");
    if (!box || !img || !imgR || !info || !info.left || !info.right) return;
    var token = ++zoomToken;
    var lw = +info.lw, lh = +info.lh, rw = +info.rw, rh = +info.rh;
    zoomLayout = (lw > 0 && lh > 0 && rw > 0 && rh > 0) ? { lw: lw, lh: lh, rw: rw, rh: rh } : null;
    zoomNatW = zoomLayout ? (lw + rw) : 1;
    zoomNatH = zoomLayout ? Math.max(lh, rh) : 1;
    OpenZoomBox();
    var leftDone = false, rightDone = false;
    function mark(side) {
        if (token !== zoomToken) return;
        if (side === "l") { if (leftDone) return; leftDone = true; }
        else { if (rightDone) return; rightDone = true; }
        if (!leftDone || !rightDone) return;
        if (!zoomLayout) {
            lw = img.naturalWidth || 1;
            lh = img.naturalHeight || 1;
            rw = imgR.naturalWidth || 1;
            rh = imgR.naturalHeight || 1;
            zoomLayout = { lw: lw, lh: lh, rw: rw, rh: rh };
            zoomNatW = lw + rw;
            zoomNatH = Math.max(lh, rh);
        }
        CenterZoom(box);
    }
    img.onload = function () { mark("l"); };
    imgR.onload = function () { mark("r"); };
    img.onerror = function () { mark("l"); };
    imgR.onerror = function () { mark("r"); };
    img.style.display = "block";
    imgR.style.display = "block";
    img.src = info.left;
    imgR.src = info.right;
    if (img.complete && img.naturalWidth) mark("l");
    if (imgR.complete && imgR.naturalWidth) mark("r");
}
function ZoomAtPointer(clientX, clientY, factor) {
    var box = document.getElementById("imageZoom");
    if (!box || box.style.display !== "block" || !(zoomNatW > 0) || !(zoomNatH > 0)) return;
    var fit = ZoomFitScale(box);
    var next = Math.max(fit, Math.min(fit * 8, zoomScale * factor));
    if (Math.abs(next - zoomScale) < 0.0001) return;
    var fx = (clientX - zoomX) / (zoomNatW * zoomScale);
    var fy = (clientY - zoomY) / (zoomNatH * zoomScale);
    zoomScale = next;
    zoomX = clientX - fx * zoomNatW * zoomScale;
    zoomY = clientY - fy * zoomNatH * zoomScale;
    PlaceZoomImage();
}
function PanZoomImage(dx, dy) {
    zoomX += dx;
    zoomY += dy;
    PlaceZoomImage();
}
function CloseZoomImage() {
    var box = document.getElementById("imageZoom");
    if (box) box.style.display = "none";
}
document.ZoomImage = ZoomImage;
document.ZoomSpread = ZoomSpread;
document.CloseZoomImage = CloseZoomImage;
document.PanZoomImage = PanZoomImage;
(function () {
    var box = document.getElementById("imageZoom");
    var img = document.getElementById("imageZoomImg");
    var imgR = document.getElementById("imageZoomImgR");
    if (!box || !img) return;
    var drag = null;
    var dragged = false;
    function startDrag(e) {
        if (e.button !== 0) return;
        drag = { x: e.clientX, y: e.clientY, l: zoomX, t: zoomY, moved: false };
        img.style.cursor = "grabbing";
        if (imgR) imgR.style.cursor = "grabbing";
        if (e.preventDefault) e.preventDefault();
    }
    img.draggable = false;
    img.addEventListener("mousedown", startDrag);
    if (imgR) {
        imgR.draggable = false;
        imgR.addEventListener("mousedown", startDrag);
    }
    window.addEventListener("mousemove", function (e) {
        if (!drag) return;
        var dx = e.clientX - drag.x;
        var dy = e.clientY - drag.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
        zoomX = drag.l + dx;
        zoomY = drag.t + dy;
        PlaceZoomImage();
    });
    window.addEventListener("mouseup", function () {
        if (!drag) return;
        dragged = drag.moved;
        drag = null;
        img.style.cursor = "grab";
        if (imgR) imgR.style.cursor = "grab";
    });
    box.addEventListener("click", function (e) {
        if (dragged) { dragged = false; return; }
        if (e.target === box) CloseZoomImage();
    });
    box.addEventListener("dblclick", function (e) {
        if (dragged) { dragged = false; if (e.preventDefault) e.preventDefault(); return; }
        CloseZoomImage();
    });
    box.addEventListener("wheel", function (e) {
        if (box.style.display !== "block") return;
        e.preventDefault();
        e.stopPropagation();
        ZoomAtPointer(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : (1 / 1.12));
    }, { passive: false });
})();
