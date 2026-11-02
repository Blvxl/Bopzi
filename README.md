# Bopzi

**A free website for Roblox thumbnails and game icons, at [bopzi.dev](https://bopzi.dev).**

Describe your game and Bopzi draws the image with your own ChatGPT plan. Then change it in plain words, or finish it by hand with text, stickers, lighting and layers.

Bopzi is free for everyone: no payment and no revenue share. The editor runs in your browser. For AI images you connect your own ChatGPT plan through a small helper that runs on your computer, and usage counts against your own plan. A Windows desktop build also exists; it uses license keys.

<p align="center"><img src="docs/images/studio.jpg" alt="A generated thumbnail open in the Bopzi studio, with a box for describing a change" width="860"></p>

## What it does

- **Generate thumbnails and icons** from a sentence, at 1920 × 1080 and 512 × 512.
- **Put your own avatar in the picture.** Type your Roblox username or paste your profile link.
- **Start from a screenshot** of your game and polish it, restyle it, or change one part.
- **Change it in plain words,** optionally inside an area you mark. Every change is kept as a version you can go back to.
- **Borrow a look** from a real Roblox thumbnail, or upload your own style reference.
- **See it the way players will** with Roblox view, before you publish.
- **Finish it by hand** with a kit of stickers and shapes, lighting and layers. Generated images are flattened; the text and images you add on top stay editable.
- **Download a test set** of 2 to 5 thumbnails for Roblox's thumbnail testing.

<p align="center"><img src="docs/images/editor.jpg" alt="The Bopzi editor with text, kit, light and layers tools" width="860"></p>

## What you need

| | |
|---|---|
| **To use Bopzi** | A modern browser. Sign up for a free account |
| **For AI images** | A paid ChatGPT plan and the Bopzi helper running on your computer |
| **For development** | Authorized repository access and [Node.js](https://nodejs.org) 20.9 or newer |
| **Desktop build** | Windows, with a license key for that computer |

Image generation is not part of the Free ChatGPT plan, and access can vary by plan. Images count against your plan's usage.

## Get started

1. Open [bopzi.dev](https://bopzi.dev), sign up and open the studio.
2. For AI images, open the connect guide in the studio. It walks you through downloading the helper and signing in to ChatGPT. Bopzi does not provide a shared ChatGPT login.
3. On the website your projects are saved in your browser. Download your work to keep a copy.

### Desktop build

The Windows app shows a **device code** on its activation screen. Send it to the owner (DM `blvxl` on Discord) and paste the license key you get back; it works only on that computer, and Bopzi logs out whenever it closes. It checks a signed list of disabled keys every hour and needs to reach it at least once every 7 days. When a new version is out, an **Update** button appears in the top bar.

### Authorized development only

```sh
git clone https://github.com/Blvxl/Bopzi.git
cd Bopzi
npm ci
npm run dev
```

Open http://127.0.0.1:3000. A license key or the owner's signing key is needed to get past activation.

## Before you rely on it

> [!WARNING]
> **The ChatGPT connection is unofficial.** Bopzi reads your local Codex sign-in on the server and calls an undocumented ChatGPT backend for images and your profile picture. This route is not supported by OpenAI for other apps. It can change or stop working at any time, and it is your responsibility to check that your use fits OpenAI's terms. See [how the integration works](docs/chatgpt-integration.md).

- **Keep the helper on your own computer.** It can use your Codex session, so never share that session, and never set `BOPZI_LOCAL_CHATGPT` on a public host. See [SECURITY.md](SECURITY.md).
- **Projects do not sync.** On the website they live in this browser, so clearing site data removes them. In the desktop build they are files in `.bopzi\library` in your user folder. They are not encrypted.
- **Know what leaves your computer.** When you generate, your prompt and attached images go to OpenAI. Avatars, game details and reference thumbnails are fetched from Roblox.
- **Check generated art yourself.** You are responsible for what you publish, including Roblox's rules and other people's rights.

## Build the Windows app

`npm run desktop` opens Bopzi in a development window. `npm run desktop:pack` builds the Windows ARM64 installer in `release/`, and `npm run desktop:pack:x64` builds the x64 one. Both download the matching Codex build and include it in the app.

`npm run release:publish -- "notes"` publishes a signed update. `npm run site:publish` publishes the public site in `site/`. Both need the owner's signing setup and GitHub access.

## Troubleshooting

- **Bopzi cannot find Codex.** Set `BOPZI_CODEX` to the full path of the executable. Optional settings are listed in [.env.example](.env.example).
- **Port 3000 is taken.** Run `npm run dev -- --port 3001`.
- **Running a production build.** Run `npm run build`, set `BOPZI_LOCAL_CHATGPT=1`, then run `npm run start`. This is for a trusted computer, not public hosting.
- **A generation fails.** Bopzi says why: a sign-in problem, your plan's image limit, or a change on ChatGPT's side that needs a Bopzi update. See [the integration notes](docs/chatgpt-integration.md).

## Contributing

The source is private. Contributions are accepted only from collaborators authorized by the owner. See [CONTRIBUTING.md](CONTRIBUTING.md). The video editor in `src/video` is unfinished and hidden from the app for now.

## License

The current version of Bopzi is proprietary and is not offered under an open-source license. Earlier copies published under MIT remain subject to the MIT terms that accompanied those copies. Using the website is free, which grants no rights to the source code. See [LICENSE](LICENSE). Third-party dependencies and bundled assets may have their own terms.

Bopzi is independent and is not affiliated with, endorsed by or sponsored by Roblox Corporation or OpenAI. Roblox and ChatGPT are trademarks of their respective owners.
