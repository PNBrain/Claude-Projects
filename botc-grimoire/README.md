# Clocktower Grimoire

A web app for running **Blood on the Clocktower** on your local network. Players use their phones, tablets or laptops for the Town Square, voting, their character and private notes. The Storyteller runs the Grimoire from any device after entering an 8-digit token.

It covers Trouble Brewing, Bad Moon Rising, Sects & Violets, a mix of all base characters, or a custom script. The 15 Travellers and 12 Fabled are included too. Ability text was checked against the character almanacs.

## Run it

You need Node.js 18 or newer. There are no packages to install.

```bash
node server.js --set-token 12345678   # once: save your Storyteller token (8 digits)
node server.js                        # start; prints the network address and token
```

Players open the printed `http://192.168.x.x:3000` address on the same Wi-Fi. If no token is saved, a random one is generated and printed at startup.

| Option | Default | |
|---|---|---|
| `PORT` env / `--port` | `3000` | Port to listen on |
| `BOTC_ST_TOKEN` env | from `data/config.json` | Overrides the saved token |
| `BOTC_DATA_DIR` env | `./data` | Where game state, notes and the token are saved |

Game state is saved to `data/state.json` on every change, so restarting the server keeps the game in progress.

## Rulebook & almanac text

Ability text is built in. For the rest of each almanac entry (flavour quote, description, examples, **How to run**), plus the rules, glossary and suggested setups, import your own PDFs once. As Storyteller, open **More → Rulebook & almanacs**, choose the rulebook and any of the four almanacs (Trouble Brewing, Bad Moon Rising, Sects & Violets, Travellers & Fabled), and press **Import**. The PDFs are read in the browser with the bundled pdf.js (it works offline), and the text is saved to `data/library.json` on the server.

The app also loads `library/library.json` if it exists. Use this path to ship a private copy of the app with the text already included. Both `data/` and `library/` are git-ignored, so the books' text is never committed by accident.

## Storyteller

To take control, enter the token on the start screen. A claim from a new device signs out the previous one. Five wrong tries locks out that address for a minute.

- **Setup**: pick the edition (or build a custom script) and arrange the seats in clockwise order. Players who join appear automatically, and you can add seats for people without a device. Choose the characters in the bag; you can see the count needed for your player count, and Baron, Godfather, Fang Gu and Vigormortis modifiers are shown. You can also use **Random bag**. Then **deal** the bag to seats at random. Drunk and Lunatic players are given a "thinks they are" character. Pick the Demon bluffs and Fabled, and send every player their character.
- **Grimoire**: the seats in a circle. Tap a seat to change its character, what the player thinks they are, alignment, alive or dead, ghost vote, drunk, poisoned, Traveller and vote weight (Bureaucrat / Thief). You can also add reminder tokens (each character's own, or custom text) and keep a private note. Send that player private info: a character token, players to point at, a number, yes/no, good/evil, or text such as THIS IS THE DEMON.
- **Night**: the night order for the characters in play, for the first night or other nights. Drunk players appear under the character they think they are. Each step has a checkbox and the official **How to run** text from the almanac (Dusk, Dawn and Minion/Demon info come from the rulebook). Before you import, short prompts appear instead. There are one-tap **Show** buttons for the Demon, the Minions and the bluffs, and a button that sends Minion and Demon info to devices. **Dawn** announces who died overnight, without saying how.
- **Show screen**: the **👁 Show** button (always on screen), the night steps, the seat editor and the Book all open a full-screen view that you can hold up to a player in place of a physical token. It can show info tokens (THIS IS THE DEMON, YOU ARE, THESE CHARACTERS ARE NOT IN PLAY…), large character tokens, players to point at, a number, YES/NO or GOOD/EVIL. **Flip** turns it 180° for the person facing you.
- **Book**: a searchable reference with every character's full almanac entry, the rulebook chapters, the glossary and each edition's suggested setups. Players get the same Book tab.
- **Day**: nominations warn you about the usual rules: dead nominators, nominating twice, being nominated twice. Players raise their hands on their own devices, and a vote clock moves round the circle from the seat after the nominee and locks in each vote. You can step it by hand or override any vote. The app tracks the threshold (half the living players), "about to die", ties and ghost votes. Travellers can be exiled (half of all players, alive or dead).
- Banners suggest a winner when every Demon is dead, only 2 non-Travellers are alive, or the Saint was executed. You decide whether to declare it.
- **Undo** reverses your last change. **New game** keeps the seats.

## Players

- **Town**: the circle, with who's alive, ghost votes, Travellers and Fabled, and the live vote with a big *raise hand* button.
- **Me**: your character and alignment once the Storyteller sends them, and every piece of private info you've received. Your phone buzzes when new info arrives. It also shows a rejoin code for moving to another device.
- **Notes**: private to you. Mark a read on each player (trusted / good / suspicious / evil / Demon), what they claim (with that ability shown), which characters they could be, and free text, plus general notes. Notes are saved on the server and on the device.
- **Book**: the characters on this script with their almanac entries, plus the rules and glossary, all searchable. The **Log** lists public events: deaths, nominations and who voted for whom.

Nothing secret is sent to a device that shouldn't see it. Players only receive public information plus their own seat's revealed character, messages and notes.
