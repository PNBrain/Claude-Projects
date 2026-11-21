/* Character data for the three base-set editions, Travellers and Fabled.
 * Loaded by the browser (window.BOTC) and by the server (require).
 * Night-order helper text is a short Storyteller prompt, not the official night sheet.
 */
(function (root) {
  'use strict';

  const EDITIONS = {
    tb: 'Trouble Brewing',
    bmr: 'Bad Moon Rising',
    snv: 'Sects & Violets',
    base: 'All base-set characters',
    custom: 'Custom script',
  };

  const TEAMS = ['townsfolk', 'outsider', 'minion', 'demon', 'traveller', 'fabled'];
  const TEAM_LABEL = {
    townsfolk: 'Townsfolk', outsider: 'Outsiders', minion: 'Minions',
    demon: 'Demons', traveller: 'Travellers', fabled: 'Fabled',
  };

  // [id, name, edition, team, ability, reminders[], setupNote?]
  const RAW = [
    // ---------------- Trouble Brewing ----------------
    ['washerwoman', 'Washerwoman', 'tb', 'townsfolk', 'You start knowing that 1 of 2 players is a particular Townsfolk.', ['Townsfolk', 'Wrong']],
    ['librarian', 'Librarian', 'tb', 'townsfolk', 'You start knowing that 1 of 2 players is a particular Outsider. (Or that zero are in play.)', ['Outsider', 'Wrong']],
    ['investigator', 'Investigator', 'tb', 'townsfolk', 'You start knowing that 1 of 2 players is a particular Minion.', ['Minion', 'Wrong']],
    ['chef', 'Chef', 'tb', 'townsfolk', 'You start knowing how many pairs of evil players there are.', []],
    ['empath', 'Empath', 'tb', 'townsfolk', 'Each night, you learn how many of your 2 alive neighbors are evil.', []],
    ['fortuneteller', 'Fortune Teller', 'tb', 'townsfolk', 'Each night, choose 2 players: you learn if either is a Demon. There is a good player that registers as a Demon to you.', ['Red herring']],
    ['undertaker', 'Undertaker', 'tb', 'townsfolk', 'Each night*, you learn which character died by execution today.', ['Executed']],
    ['monk', 'Monk', 'tb', 'townsfolk', 'Each night*, choose a player (not yourself): they are safe from the Demon tonight.', ['Safe']],
    ['ravenkeeper', 'Ravenkeeper', 'tb', 'townsfolk', 'If you die at night, you are woken to choose a player: you learn their character.', []],
    ['virgin', 'Virgin', 'tb', 'townsfolk', 'The 1st time you are nominated, if the nominator is a Townsfolk, they are executed immediately.', ['No ability']],
    ['slayer', 'Slayer', 'tb', 'townsfolk', 'Once per game, during the day, publicly choose a player: if they are the Demon, they die.', ['No ability']],
    ['soldier', 'Soldier', 'tb', 'townsfolk', 'You are safe from the Demon.', []],
    ['mayor', 'Mayor', 'tb', 'townsfolk', 'If only 3 players live & no execution occurs, your team wins. If you die at night, another player might die instead.', []],
    ['butler', 'Butler', 'tb', 'outsider', 'Each night, choose a player (not yourself): tomorrow, you may only vote if they are voting too.', ['Master']],
    ['drunk', 'Drunk', 'tb', 'outsider', 'You do not know you are the Drunk. You think you are a Townsfolk character, but you are not.', ['Is the Drunk'], 'Thinks they are a Townsfolk'],
    ['recluse', 'Recluse', 'tb', 'outsider', 'You might register as evil & as a Minion or Demon, even if dead.', []],
    ['saint', 'Saint', 'tb', 'outsider', 'If you die by execution, your team loses.', []],
    ['poisoner', 'Poisoner', 'tb', 'minion', 'Each night, choose a player: they are poisoned tonight and tomorrow day.', ['Poisoned']],
    ['spy', 'Spy', 'tb', 'minion', 'Each night, you see the Grimoire. You might register as good & as a Townsfolk or Outsider, even if dead.', []],
    ['scarletwoman', 'Scarlet Woman', 'tb', 'minion', 'If there are 5 or more players alive & the Demon dies, you become the Demon. (Travellers don’t count.)', ['Is the Demon']],
    ['baron', 'Baron', 'tb', 'minion', 'There are extra Outsiders in play. [+2 Outsiders]', [], '+2 Outsiders'],
    ['imp', 'Imp', 'tb', 'demon', 'Each night*, choose a player: they die. If you kill yourself this way, a Minion becomes the Imp.', ['Dead']],

    // ---------------- Bad Moon Rising ----------------
    ['grandmother', 'Grandmother', 'bmr', 'townsfolk', 'You start knowing a good player & their character. If the Demon kills them, you die too.', ['Grandchild']],
    ['sailor', 'Sailor', 'bmr', 'townsfolk', 'Each night, choose an alive player: either you or they are drunk until dusk. You can’t die.', ['Drunk']],
    ['chambermaid', 'Chambermaid', 'bmr', 'townsfolk', 'Each night, choose 2 alive players (not yourself): you learn how many woke tonight due to their ability.', []],
    ['exorcist', 'Exorcist', 'bmr', 'townsfolk', 'Each night*, choose a player (different to last night): the Demon, if chosen, learns who you are then doesn’t wake tonight.', ['Chosen']],
    ['innkeeper', 'Innkeeper', 'bmr', 'townsfolk', 'Each night*, choose 2 players: they can’t die tonight, but 1 is drunk until dusk.', ['Protected', 'Protected', 'Drunk']],
    ['gambler', 'Gambler', 'bmr', 'townsfolk', 'Each night*, choose a player & guess their character: if you guess wrong, you die.', ['Dead']],
    ['gossip', 'Gossip', 'bmr', 'townsfolk', 'Each day, you may make a public statement. Tonight, if it was true, a player dies.', ['Dead']],
    ['courtier', 'Courtier', 'bmr', 'townsfolk', 'Once per game, at night, choose a character: they are drunk for 3 nights & 3 days.', ['Drunk 1', 'Drunk 2', 'Drunk 3', 'No ability']],
    ['professor', 'Professor', 'bmr', 'townsfolk', 'Once per game, at night*, choose a dead player: if they are a Townsfolk, they are resurrected.', ['Alive', 'No ability']],
    ['minstrel', 'Minstrel', 'bmr', 'townsfolk', 'When a Minion dies by execution, all other players (except Travellers) are drunk until dusk tomorrow.', ['Everyone is drunk']],
    ['tealady', 'Tea Lady', 'bmr', 'townsfolk', 'If both your alive neighbors are good, they can’t die.', ['Cannot die', 'Cannot die']],
    ['pacifist', 'Pacifist', 'bmr', 'townsfolk', 'Executed good players might not die.', []],
    ['fool', 'Fool', 'bmr', 'townsfolk', 'The 1st time you die, you don’t.', ['No ability']],
    ['tinker', 'Tinker', 'bmr', 'outsider', 'You might die at any time.', ['Dead']],
    ['moonchild', 'Moonchild', 'bmr', 'outsider', 'When you learn that you died, publicly choose 1 alive player. Tonight, if it was a good player, they die.', ['Kill']],
    ['goon', 'Goon', 'bmr', 'outsider', 'Each night, the 1st player to choose you with their ability is drunk until dusk. You become their alignment.', ['Drunk']],
    ['lunatic', 'Lunatic', 'bmr', 'outsider', 'You think you are a Demon, but you are not. The Demon knows who you are & who you choose at night.', ['Attack 1', 'Attack 2', 'Attack 3'], 'Thinks they are the Demon'],
    ['godfather', 'Godfather', 'bmr', 'minion', 'You start knowing which Outsiders are in play. If 1 died today, choose a player tonight: they die. [−1 or +1 Outsider]', ['Died today', 'Dead'], '−1 or +1 Outsider'],
    ['devilsadvocate', 'Devil’s Advocate', 'bmr', 'minion', 'Each night, choose a living player (different to last night): if executed tomorrow, they don’t die.', ['Survives execution']],
    ['assassin', 'Assassin', 'bmr', 'minion', 'Once per game, at night*, choose a player: they die, even if for some reason they could not.', ['Dead', 'No ability']],
    ['mastermind', 'Mastermind', 'bmr', 'minion', 'If the Demon dies by execution (ending the game), play for 1 more day. If a player is then executed, their team loses.', []],
    ['zombuul', 'Zombuul', 'bmr', 'demon', 'Each night*, if no-one died today, choose a player: they die. The 1st time you die, you live but register as dead.', ['Died today', 'Dead']],
    ['pukka', 'Pukka', 'bmr', 'demon', 'Each night, choose a player: they are poisoned. The previously poisoned player dies then becomes healthy.', ['Poisoned', 'Dead']],
    ['shabaloth', 'Shabaloth', 'bmr', 'demon', 'Each night*, choose 2 players: they die. A dead player you chose last night might be regurgitated.', ['Dead', 'Alive']],
    ['po', 'Po', 'bmr', 'demon', 'Each night*, you may choose a player: they die. If your last choice was no-one, choose 3 players tonight.', ['Dead', '3 attacks']],

    // ---------------- Sects & Violets ----------------
    ['clockmaker', 'Clockmaker', 'snv', 'townsfolk', 'You start knowing how many steps from the Demon to its nearest Minion.', []],
    ['dreamer', 'Dreamer', 'snv', 'townsfolk', 'Each night, choose a player (not yourself or Travellers): you learn 1 good & 1 evil character, 1 of which is correct.', []],
    ['snakecharmer', 'Snake Charmer', 'snv', 'townsfolk', 'Each night, choose an alive player: a chosen Demon swaps characters & alignments with you & is then poisoned.', ['Poisoned']],
    ['mathematician', 'Mathematician', 'snv', 'townsfolk', 'Each night, you learn how many players’ abilities worked abnormally (since dawn) due to another character’s ability.', ['Abnormal']],
    ['flowergirl', 'Flowergirl', 'snv', 'townsfolk', 'Each night*, you learn if a Demon voted today.', ['Demon voted', 'Demon not voted']],
    ['towncrier', 'Town Crier', 'snv', 'townsfolk', 'Each night*, you learn if a Minion nominated today.', ['Minions nominated', 'Minions not nominated']],
    ['oracle', 'Oracle', 'snv', 'townsfolk', 'Each night*, you learn how many dead players are evil.', []],
    ['savant', 'Savant', 'snv', 'townsfolk', 'Each day, you may visit the Storyteller to learn 2 things in private: 1 is true & 1 is false.', []],
    ['seamstress', 'Seamstress', 'snv', 'townsfolk', 'Once per game, at night, choose 2 players (not yourself): you learn if they are the same alignment.', ['No ability']],
    ['philosopher', 'Philosopher', 'snv', 'townsfolk', 'Once per game, at night, choose a good character: gain that ability. If this character is in play, they are drunk.', ['Drunk', 'Is the Philosopher']],
    ['artist', 'Artist', 'snv', 'townsfolk', 'Once per game, during the day, privately ask the Storyteller any yes/no question.', ['No ability']],
    ['juggler', 'Juggler', 'snv', 'townsfolk', 'On your 1st day, publicly guess up to 5 players’ characters. That night, you learn how many you got correct.', ['Correct']],
    ['sage', 'Sage', 'snv', 'townsfolk', 'If the Demon kills you, you learn that it is 1 of 2 players.', []],
    ['mutant', 'Mutant', 'snv', 'outsider', 'If you are “mad” about being an Outsider, you might be executed.', []],
    ['sweetheart', 'Sweetheart', 'snv', 'outsider', 'When you die, 1 player is drunk from now on.', ['Drunk']],
    ['barber', 'Barber', 'snv', 'outsider', 'If you died today or tonight, the Demon may choose 2 players (not another Demon) to swap characters.', ['Haircuts tonight']],
    ['klutz', 'Klutz', 'snv', 'outsider', 'When you learn that you died, publicly choose 1 alive player: if they are evil, your team loses.', []],
    ['eviltwin', 'Evil Twin', 'snv', 'minion', 'You & an opposing player know each other. If the good player is executed, evil wins. Good can’t win if you both live.', ['Twin']],
    ['witch', 'Witch', 'snv', 'minion', 'Each night, choose a player: if they nominate tomorrow, they die. If just 3 players live, you lose this ability.', ['Cursed']],
    ['cerenovus', 'Cerenovus', 'snv', 'minion', 'Each night, choose a player & a good character: they are “mad” they are this character tomorrow, or might be executed.', ['Mad']],
    ['pithag', 'Pit-Hag', 'snv', 'minion', 'Each night*, choose a player & a character they become (if not in play). If a Demon is made, deaths tonight are arbitrary.', []],
    ['fanggu', 'Fang Gu', 'snv', 'demon', 'Each night*, choose a player: they die. The 1st Outsider this kills becomes an evil Fang Gu & you die instead. [+1 Outsider]', ['Dead', 'Once'], '+1 Outsider'],
    ['vigormortis', 'Vigormortis', 'snv', 'demon', 'Each night*, choose a player: they die. Minions you kill keep their ability & poison 1 Townsfolk neighbor. [−1 Outsider]', ['Dead', 'Has ability', 'Poisoned'], '−1 Outsider'],
    ['nodashii', 'No Dashii', 'snv', 'demon', 'Each night*, choose a player: they die. Your 2 Townsfolk neighbors are poisoned.', ['Dead', 'Poisoned', 'Poisoned']],
    ['vortox', 'Vortox', 'snv', 'demon', 'Each night*, choose a player: they die. Townsfolk abilities yield false info. Each day, if no-one is executed, evil wins.', ['Dead']],

    // ---------------- Travellers ----------------
    ['scapegoat', 'Scapegoat', 'tb', 'traveller', 'If a player of your alignment is executed, you might be executed instead.', []],
    ['gunslinger', 'Gunslinger', 'tb', 'traveller', 'Each day, after the 1st vote has been tallied, you may choose a player that voted: they die.', []],
    ['beggar', 'Beggar', 'tb', 'traveller', 'You must use a vote token to vote. If a dead player gives you theirs, you learn their alignment. You are sober & healthy.', []],
    ['bureaucrat', 'Bureaucrat', 'tb', 'traveller', 'Each night, choose a player (not yourself): their vote counts as 3 votes tomorrow.', ['3 votes']],
    ['thief', 'Thief', 'tb', 'traveller', 'Each night, choose a player (not yourself): their vote counts negatively tomorrow.', ['Negative vote']],
    ['apprentice', 'Apprentice', 'bmr', 'traveller', 'On your 1st night, you gain a Townsfolk ability (if good), or a Minion ability (if evil).', ['Is the Apprentice']],
    ['matron', 'Matron', 'bmr', 'traveller', 'Each day, you may choose up to 3 sets of 2 players to swap seats. Players may not leave their seats to talk in private.', []],
    ['judge', 'Judge', 'bmr', 'traveller', 'Once per game, if another player nominated, you may choose to force the current execution to pass or fail.', ['No ability']],
    ['bishop', 'Bishop', 'bmr', 'traveller', 'Only the Storyteller can nominate. At least 1 opposing player must be nominated each day.', ['Nominate good', 'Nominate evil']],
    ['voudon', 'Voudon', 'bmr', 'traveller', 'Only you & the dead can vote. They don’t need a vote token to do so. A 50% majority isn\u2019t required.', []],
    ['barista', 'Barista', 'snv', 'traveller', 'Each night, until dusk, 1) a player becomes sober, healthy & gets true info, or 2) their ability works twice. They learn which.', ['Sober and healthy', 'Acts twice']],
    ['harlot', 'Harlot', 'snv', 'traveller', 'Each night*, choose a living player: if they agree, you learn their character, but you both might die.', ['Dead']],
    ['butcher', 'Butcher', 'snv', 'traveller', 'Each day, after the 1st execution, you may nominate again.', []],
    ['bonecollector', 'Bone Collector', 'snv', 'traveller', 'Once per game, at night, choose a dead player: they regain their ability until dusk.', ['No ability', 'Has ability']],
    ['deviant', 'Deviant', 'snv', 'traveller', 'If you were funny today, you cannot die by exile.', []],

    // ---------------- Fabled ----------------
    ['doomsayer', 'Doomsayer', 'fabled', 'fabled', 'If 4 or more players live, each living player may publicly choose (once per game) that a player of their own alignment dies.', []],
    ['angel', 'Angel', 'fabled', 'fabled', 'Something bad might happen to whoever is most responsible for the death of a new player.', ['Protect', 'Something bad']],
    ['buddhist', 'Buddhist', 'fabled', 'fabled', 'For the first 2 minutes of each day, veteran players may not talk.', []],
    ['hellslibrarian', 'Hell’s Librarian', 'fabled', 'fabled', 'Something bad might happen to whoever talks when the Storyteller has asked for silence.', ['Something bad']],
    ['revolutionary', 'Revolutionary', 'fabled', 'fabled', '2 neighboring players are known to be the same alignment. Once per game, 1 of them registers falsely.', ['Used']],
    ['fiddler', 'Fiddler', 'fabled', 'fabled', 'Once per game, the Demon secretly chooses an opposing player: all players choose which of these 2 players win.', []],
    ['toymaker', 'Toymaker', 'fabled', 'fabled', 'The Demon may choose not to attack & must do this at least once per game. Evil players get normal starting info.', ['Final night: no attack']],
    ['fibbin', 'Fibbin', 'fabled', 'fabled', 'Once per game, 1 good player might get incorrect information.', ['Used']],
    ['duchess', 'Duchess', 'fabled', 'fabled', 'Each day, 3 players may choose to visit you. At night*, each visitor learns how many visitors are evil, but 1 gets false info.', ['Visitor', 'False info']],
    ['sentinel', 'Sentinel', 'fabled', 'fabled', 'There might be 1 extra or 1 fewer Outsider in play.', []],
    ['spiritofivory', 'Spirit of Ivory', 'fabled', 'fabled', 'There can’t be more than 1 extra evil player.', ['No more evil']],
    ['djinn', 'Djinn', 'fabled', 'fabled', 'Use the Djinn’s special rule. All players know what it is.', []],
  ];

  const CHARACTERS = {};
  const ORDER = [];
  for (const [id, name, edition, team, ability, reminders, setup] of RAW) {
    CHARACTERS[id] = { id, name, edition, team, ability, reminders: reminders || [], setup: setup || null };
    ORDER.push(id);
  }

  // Night order. Special entries: dusk, minioninfo, demoninfo, dawn.
  const FIRST_NIGHT = [
    ['dusk', 'Check that all eyes are closed. Some Travellers & Fabled act.'],
    ['barista', 'Choose a player and an effect (sober, healthy & true info OR ability works twice). Wake them and tell them which.'],
    ['philosopher', 'Philosopher may choose a good character and gains that ability. If that character is in play, that player is drunk.'],
    ['minioninfo', '7+ players: wake all Minions. Show THIS IS THE DEMON and point to the Demon. Minions see each other.'],
    ['lunatic', '7+ players: show the Lunatic THESE ARE YOUR MINIONS (any players) and 3 bluffs. Then wake the real Demon and show them the Lunatic.'],
    ['demoninfo', '7+ players: wake the Demon. Show THESE ARE YOUR MINIONS and point to each. Then show 3 good characters that are not in play (bluffs).'],
    ['apprentice', 'Show the Apprentice which ability they gain (Townsfolk if good, Minion if evil).'],
    ['sailor', 'Sailor chooses an alive player: one of the two is drunk until dusk.'],
    ['courtier', 'Courtier may choose a character: if in play, that player is drunk for 3 nights & 3 days.'],
    ['snakecharmer', 'Snake Charmer chooses an alive player. If the Demon: swap characters & alignments, then poison the new Demon. Wake both, show YOU ARE.'],
    ['godfather', 'Show the Godfather the Outsider tokens that are in play.'],
    ['devilsadvocate', 'Devil’s Advocate chooses a living player: if executed tomorrow, they don’t die.'],
    ['eviltwin', 'Wake both twins. Show each the other player and their character.'],
    ['witch', 'Witch chooses a player: if they nominate tomorrow, they die.'],
    ['cerenovus', 'Cerenovus chooses a player & a good character. Wake that player and show them the character: they must be mad about it.'],
    ['poisoner', 'Poisoner chooses a player: poisoned tonight and tomorrow day.'],
    ['bureaucrat', 'Bureaucrat chooses a player: their vote counts as 3 tomorrow.'],
    ['thief', 'Thief chooses a player: their vote counts negatively tomorrow.'],
    ['pukka', 'Pukka chooses a player: they are poisoned. (Nobody dies tonight.)'],
    ['grandmother', 'Show the Grandmother their grandchild (point to the player, show their character).'],
    ['washerwoman', 'Show a Townsfolk token and point to 2 players, one of whom is that character.'],
    ['librarian', 'Show an Outsider token and point to 2 players, one of whom is that character (or show 0).'],
    ['investigator', 'Show a Minion token and point to 2 players, one of whom is that character.'],
    ['chef', 'Show with fingers how many pairs of evil players are neighbors.'],
    ['empath', 'Show with fingers how many alive neighbors are evil.'],
    ['fortuneteller', 'Fortune Teller chooses 2 players. Nod if either is the Demon (or the red herring).'],
    ['butler', 'Butler chooses a player (not themselves) as their master.'],
    ['clockmaker', 'Show with fingers how many steps from the Demon to its nearest Minion.'],
    ['dreamer', 'Dreamer chooses a player: show 1 good and 1 evil character, one of which is correct.'],
    ['seamstress', 'Seamstress may choose 2 players (once per game): nod if they are the same alignment.'],
    ['chambermaid', 'Chambermaid chooses 2 alive players (not themselves): show how many woke tonight due to their ability.'],
    ['mathematician', 'Show with fingers how many abilities worked abnormally due to another character’s ability.'],
    ['spy', 'Show the Spy the Grimoire for as long as they need.'],
    ['dawn', 'Wait a few seconds, then call for eyes open. Announce who died, but not how.'],
  ];

  const OTHER_NIGHT = [
    ['dusk', 'Check that all eyes are closed. Some Travellers & Fabled act.'],
    ['barista', 'Choose a player and an effect (sober, healthy & true info OR ability works twice). Wake them and tell them which.'],
    ['bonecollector', 'Bone Collector may choose a dead player: they regain their ability until dusk.'],
    ['harlot', 'Harlot chooses a living player. If that player agrees, show the Harlot their character. Both might die.'],
    ['bureaucrat', 'Bureaucrat chooses a player: their vote counts as 3 tomorrow.'],
    ['thief', 'Thief chooses a player: their vote counts negatively tomorrow.'],
    ['philosopher', 'Philosopher may choose a good character and gains that ability. If that character is in play, that player is drunk.'],
    ['sailor', 'Sailor chooses an alive player: one of the two is drunk until dusk.'],
    ['poisoner', 'Poisoner chooses a player: poisoned tonight and tomorrow day.'],
    ['courtier', 'Courtier may choose a character: if in play, that player is drunk for 3 nights & 3 days.'],
    ['innkeeper', 'Innkeeper chooses 2 players: they can’t die tonight, but 1 of them is drunk until dusk.'],
    ['gambler', 'Gambler chooses a player and guesses their character: if wrong, the Gambler dies.'],
    ['snakecharmer', 'Snake Charmer chooses an alive player. If the Demon: swap characters & alignments, then poison the new Demon. Wake both, show YOU ARE.'],
    ['monk', 'Monk chooses a player (not themselves): safe from the Demon tonight.'],
    ['devilsadvocate', 'Devil’s Advocate chooses a living player (different to last night): if executed tomorrow, they don’t die.'],
    ['witch', 'Witch chooses a player: if they nominate tomorrow, they die. (No ability if only 3 players live.)'],
    ['cerenovus', 'Cerenovus chooses a player & a good character. Wake that player and show them the character: they must be mad about it.'],
    ['pithag', 'Pit-Hag chooses a player & a character not in play: they become it. Wake them to show YOU ARE.'],
    ['scarletwoman', 'If the Demon died today with 5+ players alive, wake the Scarlet Woman and show YOU ARE + the Demon token.'],
    ['lunatic', 'Lunatic chooses as if they were the Demon. Then wake the real Demon and show who the Lunatic chose.'],
    ['exorcist', 'Exorcist chooses a player (different to last night). If the Demon: wake the Demon, show the Exorcist. The Demon doesn’t act tonight.'],
    ['imp', 'Imp chooses a player: they die. If the Imp chose itself, a Minion becomes the Imp; wake them, show YOU ARE.'],
    ['zombuul', 'If nobody died today, Zombuul chooses a player: they die.'],
    ['pukka', 'Pukka chooses a player: they are poisoned. The previously poisoned player dies, then becomes healthy.'],
    ['shabaloth', 'Shabaloth chooses 2 players: they die. A dead player chosen last night might be regurgitated.'],
    ['po', 'Po may choose a player (or no-one). If the last choice was no-one, they choose 3 players tonight.'],
    ['fanggu', 'Fang Gu chooses a player: they die. If the first Outsider is chosen, they become an evil Fang Gu and the old Fang Gu dies instead.'],
    ['nodashii', 'No Dashii chooses a player: they die.'],
    ['vortox', 'Vortox chooses a player: they die.'],
    ['vigormortis', 'Vigormortis chooses a player: they die. A killed Minion keeps their ability and poisons a Townsfolk neighbor.'],
    ['assassin', 'Assassin may choose a player (once per game): they die, even if protected.'],
    ['godfather', 'If an Outsider died today, Godfather chooses a player: they die.'],
    ['gossip', 'If the Gossip’s public statement today was true, a player dies.'],
    ['barber', 'If the Barber died today or tonight, wake the Demon: they may choose 2 players (not another Demon) to swap characters.'],
    ['sweetheart', 'If the Sweetheart died, choose a player: drunk from now on.'],
    ['sage', 'If the Demon killed the Sage, wake them and point to 2 players, one of whom is the Demon.'],
    ['professor', 'Professor may choose a dead player (once per game): if a Townsfolk, they are resurrected.'],
    ['tinker', 'The Tinker might die.'],
    ['moonchild', 'If the Moonchild chose a good player today, that player dies.'],
    ['grandmother', 'If the Demon killed the grandchild tonight, the Grandmother dies too.'],
    ['ravenkeeper', 'If the Ravenkeeper died tonight, wake them: they choose a player and you show that player’s character.'],
    ['empath', 'Show with fingers how many alive neighbors are evil.'],
    ['fortuneteller', 'Fortune Teller chooses 2 players. Nod if either is the Demon (or the red herring).'],
    ['undertaker', 'If a player was executed today, show their character.'],
    ['dreamer', 'Dreamer chooses a player: show 1 good and 1 evil character, one of which is correct.'],
    ['flowergirl', 'Nod if a Demon voted today; shake head if not.'],
    ['towncrier', 'Nod if a Minion nominated today; shake head if not.'],
    ['oracle', 'Show with fingers how many dead players are evil.'],
    ['seamstress', 'Seamstress may choose 2 players (once per game): nod if they are the same alignment.'],
    ['juggler', 'If the Juggler guessed today (their 1st day), show how many guesses were correct.'],
    ['butler', 'Butler chooses a player (not themselves) as their master.'],
    ['spy', 'Show the Spy the Grimoire for as long as they need.'],
    ['chambermaid', 'Chambermaid chooses 2 alive players (not themselves): show how many woke tonight due to their ability.'],
    ['mathematician', 'Show with fingers how many abilities worked abnormally due to another character’s ability.'],
    ['dawn', 'Wait a few seconds, then call for eyes open. Announce who died, but not how.'],
  ];

  // Setup sheet: Townsfolk / Outsiders / Minions / Demons for 5..15 players.
  const DISTRIBUTION = {
    5: [3, 0, 1, 1], 6: [3, 1, 1, 1], 7: [5, 0, 1, 1], 8: [5, 1, 1, 1], 9: [5, 2, 1, 1],
    10: [7, 0, 2, 1], 11: [7, 1, 2, 1], 12: [7, 2, 2, 1], 13: [9, 0, 3, 1], 14: [9, 1, 3, 1], 15: [9, 2, 3, 1],
  };
  function distribution(n) {
    if (n < 5) return null;
    return DISTRIBUTION[Math.min(n, 15)];
  }

  // Outsider count modifiers from setup characters (chosen value when a range is given).
  const OUTSIDER_MOD = { baron: 2, fanggu: 1, vigormortis: -1, godfather: 1 };

  function editionScript(edition) {
    if (edition === 'base') return ORDER.filter((id) => !['traveller', 'fabled'].includes(CHARACTERS[id].team));
    return ORDER.filter((id) => CHARACTERS[id].edition === edition && CHARACTERS[id].team !== 'traveller');
  }
  function editionTravellers(edition) {
    const all = ORDER.filter((id) => CHARACTERS[id].team === 'traveller');
    if (edition === 'base' || edition === 'custom') return all;
    return all.filter((id) => CHARACTERS[id].edition === edition);
  }
  function defaultAlignment(id) {
    const c = CHARACTERS[id];
    if (!c) return 'good';
    return c.team === 'minion' || c.team === 'demon' ? 'evil' : 'good';
  }

  const api = {
    EDITIONS, TEAMS, TEAM_LABEL, CHARACTERS, ORDER, FIRST_NIGHT, OTHER_NIGHT,
    DISTRIBUTION, OUTSIDER_MOD, distribution, editionScript, editionTravellers, defaultAlignment,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BOTC = api;
})(typeof window !== 'undefined' ? window : globalThis);
