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