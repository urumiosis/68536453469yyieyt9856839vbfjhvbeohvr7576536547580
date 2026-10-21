
(function () {
  const bait = document.createElement("div");
  bait.className = "ad ads ad-banner ad-unit";
  bait.style.cssText =
    "position:absolute;left:-9999px;width:10px;height:10px;";
  document.body.appendChild(bait);

  setTimeout(function () {
    const blocked =
      bait.offsetHeight === 0 ||
      bait.offsetWidth === 0 ||
      getComputedStyle(bait).display === "none" ||
      getComputedStyle(bait).visibility === "hidden";

    bait.remove();

    if (blocked) {
      const notice = document.createElement("div");
      notice.textContent =
        "Stäng av din adblock för att använda den här sidan.";
      notice.style.cssText =
        "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);" +
        "background:#222;color:white;padding:16px 22px;border-radius:10px;" +
        "z-index:999999;max-width:90%;text-align:center;";
      document.body.appendChild(notice);
    }
  }, 300);
})();
