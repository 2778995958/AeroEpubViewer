var langCodes = ["ja", "zh-TW", "zh-CN", "en"];
var currentLanguage = 0;
document.currentLanguage = 0;
document.uiLanguage = "ja";

var stringTable = [
    ["検査", "檢查", "检查", "Inspector"],
    ["イラスト チラ見", "速覽插圖", "速览插图", "Illustrations"],
    ["検索", "搜尋", "搜索", "Search"],
    ["書籍情報", "書籍資訊", "书籍信息", "Book Info"],
    ["画像をコピー", "複製圖片", "复制图片", "Copy Image"],
    ["要素検査", "檢查元素", "检查元素", "Inspect Element"],
    ["開く", "開檔", "打开", "Open"],
    ["画集", "畫冊", "画册", "Album"],
    ["字サイズ適用", "套用字級", "字号生效", "Apply size"],
    ["テーマ", "主題", "主题", "Theme"],
    ["閉じる", "關閉", "关闭", "Close"],
    ["スクロール", "滾動", "滚动", "Scroll"],
    ["ページ", "分頁", "分页", "Paginated"],
    ["単ページ", "單頁", "单页", "Single page"],
    ["見開き", "雙頁", "双页", "Two-page"],
    ["小さい画像を隠す", "隱藏小圖", "隐藏小图", "Hide Small Image"],
    ["挿絵", "插圖", "插图", "Illustrations"],
    ["クリックで拡大　ダブルクリックで本文　Esc で戻る", "點選放大　連點前往正文　Esc 返回", "点击放大　双击前往正文　Esc 返回", "Click to zoom  Double-click to jump  Esc back"],
    ["この本には閾値以上の挿絵がありません", "這本書沒有達到門檻的插圖", "这本书没有达到门槛的插图", "No illustrations above the size threshold"],
    ["← → 前後", "← → 鄰近", "← → 相邻", "← → Nearby"],
    ["このページへ", "前往此頁", "前往此页", "Go to page"],
    ["左右の余白で前後　ほかは戻る　ダブルクリックで本文", "左右空白換頁　其餘回到畫冊　連點前往正文", "左右空白换页　其余回到画册　双击前往正文", "Side margins turn pages  elsewhere back  double-click to jump"],
    ["開いています…", "開啟中…", "打开中…", "Opening…"],
    ["言語", "語言", "语言", "Language"],
    ["枚", "張", "张", ""]
];

var stringLoadList = [
    ["string_inspector", 0],
    ["string_viewillu", 1],
    ["string_search", 2],
    ["string_bookinfo", 3],
    ["string_open", 6],
    ["string_album", 7],
    ["string_font_apply", 8],
    ["string_theme", 9],
    ["string_lang", 23]
];

var stringNameList = {
    CopyImage: 4,
    InspectElement: 5,
    Close: 10,
    Scroll: 11,
    Paged: 12,
    Single: 13,
    Dual: 14,
    HideSmall: 15,
    AlbumTitle: 16,
    AlbumHint: 17,
    AlbumEmpty: 18,
    Nearby: 19,
    GoPage: 20,
    LightboxHint: 21,
    Opening: 22,
    AlbumCount: 24
};

function LangIndex(code) {
    if (!code) return 0;
    var i = langCodes.indexOf(code);
    return i >= 0 ? i : 0;
}
function LoadString() {
    stringLoadList.forEach(function (x) {
        var el = document.getElementById(x[0]);
        if (el) el.innerHTML = stringTable[x[1]][currentLanguage];
    });
    var closes = document.getElementsByClassName("sp_frame_close");
    for (var i = 0; i < closes.length; i++) closes[i].innerHTML = GetStringByName("Close");
    var mask = document.getElementById("openMask");
    if (mask) mask.innerHTML = GetStringByName("Opening");
    if (typeof UpdatePagedLabel === "function") UpdatePagedLabel();
}
function GetStringByName(name) {
    return stringTable[stringNameList[name]][currentLanguage];
}
function SetUiLanguage() {
    var sel = document.getElementById("langSelect");
    var code = sel ? sel.value : "ja";
    ApplyUiLanguage(code);
    if (typeof AppCall === "function") AppCall("aeroepub://domain/app/lang/" + code);
}
function ApplyUiLanguage(code) {
    currentLanguage = LangIndex(code);
    document.currentLanguage = currentLanguage;
    document.uiLanguage = langCodes[currentLanguage];
    var sel = document.getElementById("langSelect");
    if (sel) sel.value = langCodes[currentLanguage];
    LoadString();
}
LoadString();
