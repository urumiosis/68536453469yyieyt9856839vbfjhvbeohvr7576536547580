
(function () {
  const bait = document.createElement("div");
  bait.className = "ad ads ad-banner ad-unit";
  bait.style.cssText =
    "position:absolute;top:0;left:-9999px;width:10px;height:10px;";
  document.body.appendChild(bait);

  setTimeout(function () {
    const style = getComputedStyle(bait);
    const blocked =
      bait.offsetWidth === 0 ||
      bait.offsetHeight === 0 ||
      style.display === "none" ||
      style.visibility === "hidden";

    bait.remove();

    if (blocked) {
      // Cover the entire page
      const wall = document.createElement("div");
      wall.style.cssText = `
        position:fixed;
        inset:0;
        z-index:2147483647;
        background:#111;
        color:white;
        display:flex;
        align-items:center;
        justify-content:center;
        text-align:center;
        padding:24px;
        font-family:Arial,sans-serif;
      `;

      wall.innerHTML = `
        <div>
          <h1>Adblock detected</h1>
          <p>Stäng av din jävla adblock för att använda den här sidan</p>
          <button id="retry-adblock"
            style="padding:12px 20px;cursor:pointer">
            Okej senpai
          </button>
        </div>
      `;

      document.body.appendChild(wall);

      document.getElementById("retry-adblock")
        .addEventListener("click", function () {
          location.reload();
        });
    }
  }, 300);
})();
