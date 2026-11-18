
const versionSelect = document.getElementById("version");
const buttonContainer = document.getElementById("button-container");
const loginForm = document.getElementById("login-form");
const message = document.getElementById("message");

function renderVersion(version) {
  buttonContainer.replaceChildren();

  const button = document.createElement("button");
  button.type = "submit";

  if (version === "a") {
    button.id = "login-button";
    button.textContent = "Login";
  } else {
    button.dataset.testid = "sign-in";
    button.textContent = "Continue";
  }

  buttonContainer.appendChild(button);
  message.textContent = "";
}

versionSelect.addEventListener("change", () => {
  renderVersion(versionSelect.value);
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  if (username === "demo" && password === "demo123") {
    message.textContent = "Login successful";
  } else {
    message.textContent = "Invalid credentials";
  }
});

renderVersion("a");
