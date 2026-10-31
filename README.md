<p align="center"><img src="docs/images/home.jpg" alt="The Bopzi home page: a prompt box above three Roblox thumbnails" width="860"></p>

# Bopzi

**A proprietary studio for Roblox thumbnails and game icons. It runs on your computer.**

Describe your game and Bopzi draws the image with your own ChatGPT plan. Then change it in plain words, or finish it by hand with text, stickers, lighting and layers.

Sign in to Bopzi with the account issued to you after accepting the separate 5% game-revenue-share agreement. Then connect your own ChatGPT/Codex account for AI image generation; usage counts against your own plan.

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
| **To use Bopzi** | Windows and an approved Bopzi account |
| **For AI images** | A paid ChatGPT plan |
| **For development** | Authorized repository access and [Node.js](https://nodejs.org) 20.9 or newer |
| **Tested on** | Windows |

Image generation is not part of the Free ChatGPT plan, and access can vary by plan. Images count against your plan's usage.

## Get started

Access to Bopzi is provided privately to approved game creators. The GitHub repository is private and is for authorized development collaborators; repository access is not a Bopzi user account or product license.

First sign in to Bopzi with the account provided to you. Then connect your own ChatGPT/Codex account from the account menu. Bopzi does not provide a shared ChatGPT login. Your Bopzi access and ChatGPT connection are separate.

For access or installation details, contact the person who issued your Bopzi account.

### Authorized development only

```sh
git clone https://github.com/Blvxl/Bopzi.git
cd Bopzi
npm ci
npm run dev
```

Open http://127.0.0.1:3000. Development access and any required credentials are issued privately to authorized collaborators.

## Before you rely on it

> [!WARNING]
> **The ChatGPT connection is unofficial.** Bopzi reads your local Codex sign-in on the server and calls an undocumented ChatGPT backend for images and your profile picture. This route is not supported by OpenAI for other apps. It can change or stop working at any time, and it is your responsibility to check that your use fits OpenAI's terms. See [how the integration works](docs/chatgpt-integration.md).

- **Keep it on your own computer.** Bopzi can use your Codex session and read local files, so never put it on the internet or share your Codex session. See [SECURITY.md](SECURITY.md).
- **Export what you want to keep.** Projects are stored on this device and shown only to the account that made them. They do not sync, and they are not encrypted.
- **Know what leaves your computer.** When you generate, your prompt and attached images go to OpenAI. Avatars, game details and reference thumbnails are fetched from Roblox.
- **Check generated art yourself.** You are responsible for what you publish, including Roblox's rules and other people's rights.

## Build the Windows app

`npm run desktop` opens Bopzi in a development window. `npm run desktop:pack` builds the Windows ARM64 installer in `release/`, and `npm run desktop:pack:x64` builds the x64 one. Both download the matching Codex build and include it in the app.

## Troubleshooting

- **Bopzi cannot find Codex.** Set `BOPZI_CODEX` to the full path of the executable. Optional settings are listed in [.env.example](.env.example).
- **Port 3000 is taken.** Run `npm run dev -- --port 3001`.
- **Running a production build.** Run `npm run build`, set `BOPZI_LOCAL_CHATGPT=1`, then run `npm run start`. This is for a trusted computer, not public hosting.
- **A generation fails.** Your plan may not include the image model, or the backend may have changed. Check your plan with the account button, then see [the integration notes](docs/chatgpt-integration.md).

## Contributing

This is a private proprietary project. Contributions are accepted only from collaborators authorized by the owner. See [CONTRIBUTING.md](CONTRIBUTING.md). The video editor in `src/video` is unfinished and hidden from the app for now.

## License

The current version of Bopzi is proprietary and is not offered under an open-source license. Earlier copies published under MIT remain subject to the MIT terms that accompanied those copies. Access for approved game creators is governed by a separate agreement; this repository notice does not set those commercial terms. See [LICENSE](LICENSE). Third-party dependencies and bundled assets may have their own terms.

Bopzi is independent and is not affiliated with, endorsed by or sponsored by Roblox Corporation or OpenAI. Roblox and ChatGPT are trademarks of their respective owners.
