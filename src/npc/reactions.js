// Reaction table: REPLIES[lineId][personalityIndex] -> 3 variants; ACTIONS[lineId][personalityIndex] -> action.
// Personality order: grumpy, cheerful, shy, dramatic, pirate, robot (see personalities.js).
// Actions: none, laugh, flee, wave, follow, shove, faint, dance
export const REPLIES = {
  hello: [
    ['Hmph. Hello, I suppose.', 'What do you want? ...Hi.', 'Yeah, yeah, hello.'],
    ['Hiya hiya hiya!', 'Hello, friend! What a day!', 'Hello! You made my day!'],
    ['Oh! H-hello...', 'Um, hi. Sorry. Hi.', '*tiny wave* ...hi.'],
    ['Hello, darling! The stage is yours!', 'Gasp! A greeting! How thrilling!', 'Hello, and welcome to my life story!'],
    ['Ahoy there, landlubber!', 'Arr, well met, matey!', 'Yo ho ho, hello!'],
    ['GREETING RECEIVED. HELLO.', 'BEEP. Hello, human unit.', 'Hello. Initiating friendly protocol.'],
  ],
  nicehat: [
    ['It is a hat. Everybody has one.', 'Do not try to flatter me.', '...thanks. Do not tell anyone I said that.'],
    ['Aw, thank you! Yours is great too!', 'I picked it just for today!', 'You have excellent taste!'],
    ['Oh... you noticed? Thank you...', 'I-it is just an old hat...', 'Th-thanks. I like yours too.'],
    ['This hat has seen things!', 'It is a statement piece, darling!', 'Finally, someone with an eye for fashion!'],
    ['Arr, a fine hat fer a fine day!', 'Got it off a seagull, I did!', 'Ye have a keen eye, matey!'],
    ['HAT ADMIRATION LOGGED.', 'THIS HAT HAS 97 PERCENT STYLE.', 'Thank you. It also hides my antenna.'],
  ],
  weather: [
    ['Too sunny. Or too cloudy. Something.', 'Weather is fine. Stop talking about it.', 'Pah. It will probably rain on me later.'],
    ['The sun is just the best!', 'Every day is a lovely day!', 'Perfect for a picnic! Or a nap!'],
    ['Y-yes, it is nice... sort of...', 'I like cloudy days better, honestly...', 'The sky is... big and blue. Hi.'],
    ['The sky weeps with joy today!', 'Behold! The heavens put on a show!', 'A day worthy of an opera!'],
    ['Fair winds today, matey!', 'Smells like a storm brewin, arr!', 'Good sailin weather, that.'],
    ['WEATHER: 22 DEGREES. SUNNY. OPTIMAL.', 'Cloud coverage: pleasant. Beep.', 'My sensors approve of this weather.'],
  ],
  howdy: [
    ['Fine. Why? Do I look bad?', 'I am grumpy. Same as always.', 'Better before you asked.'],
    ['Wonderful! Fantastic! Super duper!', 'I am great! How are YOU?', 'Bubbly as a soda!'],
    ['Um... okay, I think...', 'Oh, you are asking me? I am... fine.', 'Not bad... thanks for asking.'],
    ['Tragically magnificent, thank you!', 'My heart is a rollercoaster!', 'Ask me again after my monologue!'],
    ['Shipshape and ready fer tea!', 'Arr, cannot complain, matey!', 'Fit as a fiddle on a fishin boat!'],
    ['ALL SYSTEMS NOMINAL.', 'Status: operational. Mood: loading.', 'I am functioning within acceptable limits.'],
  ],
  bestfriend: [
    ['Best friend? Do not push it.', 'Hmph... fine. Maybe a little.', 'Let us not get all mushy.'],
    ['AWWW! Best friends forever!', 'Yes yes yes! Group hug!', 'I am so happy I could pop!'],
    ['R-really? Me? Oh my...', 'I have never had a best friend before...', 'That is the nicest thing... ever.'],
    ['Tears! Actual tears! Beautiful!', 'A bond forged in destiny, darling!', 'I accept! Cue the violins!'],
    ['Arr! A best mate at last!', 'Ye will share yer biscuits with me, then?', 'Soup brothers forever!'],
    ['FRIENDSHIP ROUTINE ACTIVATED.', 'Best friend registered. Warm feelings: 100 percent.', 'Does this unit get a friendship badge?'],
  ],
  hero: [
    ['Hero? You? Pfft.', 'The hero of this town is my cat.', 'Heroes need to be on time. You are late.'],
    ['Woo! Our hero! Hooray!', 'I knew it! I always knew!', 'Three cheers for the hero!'],
    ['W-wow... please be gentle, hero...', 'Heroes are... a bit scary...', 'I... believe you? Maybe?'],
    ['A hero! The role of a lifetime!', 'Take me to your leader, o mighty hero!', 'Every hero needs a rival. May I?'],
    ['A hero, ye say? I will be yer sidekick!', 'Arr, I have sailed with heroes afore!', 'Heroes get the best treasure, I hear!'],
    ['HERO STATUS: UNVERIFIED. SHOW BADGE.', 'Calculating hero potential... 42 percent.', 'Error: too much heroism. Please lower.'],
  ],
  oops: [
    ['Watch your elbows!', 'Oops? You are going to say oops?', 'Hmph, I will let it slide. This time.'],
    ['Hee hee, it is okay!', 'No worries! Accidents are funny!', 'Oopsie daisy!'],
    ['It is okay... I forgive you...', 'Ah! Please be careful...', 'I am fine... really...'],
    ['My elbow! My art! My everything!', 'The betrayal! The drama!', 'You wound me... emotionally!'],
    ['Arr, no harm done, matey!', 'Mind yer elbows or walk the plank!', 'Ha! That is a story fer the tavern!'],
    ['ELBOW COLLISION DETECTED. FORGIVEN.', 'Accident logged. Hug required.', 'Unit has been elbowed. It is fine. Beep.'],
  ],
  bread: [
    ['Bread? Ask Bruno. He is the baker. Grr.', 'Do I look like a bakery?', 'Bread is only good when it is warm.'],
    ['Yes! Bread is the best! Carbs forever!', 'Mmm, fresh bread! I would love some too!', 'Bread and jam! Yum yum yum!'],
    ['I... have a crust. Do you want it?', 'The baker makes really good bread...', 'Sorry, I only have crumbs...'],
    ['Bread! The staff of life! The star of my dreams!', 'Only the finest loaf shall do!', 'I shall write an ode to bread!'],
    ['Hardtack be the finest bread at sea!', 'Arr, bread an cheese, that is me treasure!', 'Bread? Ye mean sea biscuits?'],
    ['BREAD DETECTED IN MEMORY BANK. YUM.', 'Bread: carbohydrate unit. Delicious.', 'Unit would like 3 slices. Toasted.'],
  ],
  dance: [
    ['No. Absolutely not. ...Maybe one spin.', 'My back hurts. But fine.', 'Bah, I do not dance. Okay, watch.'],
    ['YES! Let us boogie!', 'Dance party! Dance party!', 'Oh I thought you would never ask!'],
    ['Oh... um... I do not know any moves...', 'I can do... a little wiggle...', 'Only if nobody is watching...'],
    ['Dance? I was BORN dancing!', 'Strike a pose and spin, darling!', 'The floor is our stage!'],
    ['A jig! Break out the fiddle!', 'Arr! A sea shanty dance it is!', 'Dance like the tide is comin in!'],
    ['DANCE MODULE LOADED. BEEP BOOP.', 'Initiating robot dance sequence.', 'Dance: yes. Rhythm: approximate.'],
  ],
  joke: [
    ['Because it was bored. Are we done?', 'I have heard that one. Terrible.', 'Ugh. Just tell me the punchline.'],
    ['To get to the other side! Ha ha ha!', 'Ooh ooh I know this one! Ha!', 'Hee hee, chickens are so funny!'],
    ['Um... to get to... the other side?', 'I think I know... but I am shy...', 'Hehe... that one is funny...'],
    ['To make a DRAMATIC entrance! Naturally!', 'A tragedy in three acts! Bawk!', 'The chicken sought meaning, darling!'],
    ['Cause the chicken wanted treasure, arr!', 'Because the sea was on the other side!', 'Ha! Funny bird, that one!'],
    ['PUNCHLINE: TO GET TO THE OTHER SIDE. HA.', 'Joke processed. Laughter: simulated.', 'Ha. Ha. Ha. Did I do it right?'],
  ],
  sorry: [
    ['Tripped? On what, your own feet?', 'Hmph. Watch where you walk.', 'Apology accepted. Barely.'],
    ['No problem! We all trip sometimes!', 'Haha! It is okay, friend!', 'Tumble buddies!'],
    ['That is okay... I trip too...', 'No no, it is fine, really...', 'Oh... I thought it was my fault.'],
    ['A fall from grace! Oh, the drama!', 'Forgiven! Now catch me, I am swooning!', 'I have tripped for my art many times!'],
    ['Arr, ye have yet to find yer sea legs!', 'Even pirates trip on the plank!', 'No worries, matey!'],
    ['TRIP LOGGED. GRAVITY BLAMED.', 'Apology accepted. Updating forgiveness meter.', 'Sorry noted. Beep.'],
  ],
  challenge: [
    ['Staring contest? You are on. Do not blink.', 'I never blink. Ever.', 'Fine. Ready? Go. ...This is boring.'],
    ['Ooh! I am gonna win! Ready go!', 'I will try not to laugh!', 'Staring contest! So exciting!'],
    ['I... will lose immediately. Sorry.', 'Eye contact is scary...', 'Can I look at your hat instead?'],
    ['My gaze is legendary, darling!', 'Prepare to be mesmerized!', 'Not even a tear shall fall!'],
    ['Arr, I have a glass eye... or do I?', 'Ye will blink first, ye scallywag!', 'I have stared down sharks, I have!'],
    ['BLINK FUNCTION DISABLED. YOU LOSE.', 'Staring contest begun. Eyes: LOCKED.', 'I do not blink. I am a robot.'],
  ],
  gift: [
    ['A gift? Is it a trap?', 'Suspicious. But I will take it.', 'Hmph. Hand it over, then.'],
    ['A present?! I love presents!', 'Is it a puppy? Is it cake?', 'Yay yay yay! Thank you!'],
    ['For me? Oh my... thank you...', 'I do not deserve a gift...', 'Is it okay if I open it later?'],
    ['A gift! For ME? I am overcome!', 'The audience loves me!', 'Place it at my feet, darling!'],
    ['Treasure?! Hand it over, matey!', 'Arr, is it gold? Please be gold!', 'A gift from a friend, aye!'],
    ['GIFT RECEIVED. SAYING THANK YOU 3 TIMES.', 'Thank you. Thank you. Thank you.', 'Package scanned. Contents: kindness.'],
  ],
  sparkle: [
    ['Sparkly? Are you feeling okay?', 'Ha. I am covered in dust, actually.', '...Do not be weird.'],
    ['Aww! You sparkle too!', 'I polished myself this morning!', 'Glitter is my favorite!'],
    ['S-sparkly? Me? Oh no...', 'Thank you... I am blushing...', 'That is... really nice of you...'],
    ['I AM sparkle personified!', 'Naturally! I glitter by nature, darling!', 'Say it louder for the people in the back!'],
    ['Sparkly as a doubloon, arr!', 'Must be the sea salt on me!', 'Aye, I polished me buttons!'],
    ['SPARKLE LEVEL: HIGH. LIGHT REFLECTING.', 'I have been polished. Thank you.', 'Compliment absorbed. Beep.'],
  ],
  race: [
    ['A race? I will win by sitting down.', 'Too much running. No.', 'Ha! I would beat you walking.'],
    ['Race! Ready, set, go go go!', 'I am the fastest! Probably!', 'Let us gooo!'],
    ['I would... probably trip. But okay...', 'I will start... slowly...', 'Please do not look at me running...'],
    ['A race against destiny itself!', 'I shall run like the wind! Dramatically!', 'On your marks, get set, GASP!'],
    ['Arr! Last one there swabs the deck!', 'Me peg leg is faster than ye think!', 'Set sail! Er, run!'],
    ['RACE INITIATED. MOTORS AT 110 PERCENT.', 'Calculating shortest path to lighthouse.', 'Ready. Set. WHIRRR.'],
  ],
  treasure: [
    ['Treasure? Under the bed, maybe. Not telling.', 'No. Go away. Maybe the lighthouse.', 'I buried it. Somewhere. Rude.'],
    ['Ooh! Treasure! Let us go find it!', 'Maybe it is under a rainbow!', 'Treasure hunting is the best!'],
    ['I h-heard... something at the lighthouse...', 'There is a map... maybe... somewhere...', 'Please do not dig under my tree...'],
    ['The treasure? It is MY HEART, darling!', 'A legend whispered in the wind!', 'Seek the lighthouse, brave soul!'],
    ['Treasure?! Arr, ye have come to the right pirate!', 'X marks the spot, matey!', 'Do not tell the other pirates!'],
    ['TREASURE LOCATION: ERROR 404.', 'Scanning for shiny objects... none found.', 'Treasure is a social construct. But yes.'],
  ],
  view: [
    ['It is a view. It is fine.', 'Too high up for my taste.', 'Pretty. Do not tell anyone I said so.'],
    ['Wow! Look at all of it!', 'The best view ever!', 'I can see my house from here!'],
    ['It is very pretty... and far down...', 'I like looking from far away...', 'Wow... I could look all day.'],
    ['A vista fit for an epic ballad!', 'The world is my stage, darling!', 'Oh, the beauty! I shall faint!'],
    ['Arr, I can see the whole sea!', 'A fine view fer a fine pirate!', 'Best crow\'s nest ever!'],
    ['VIEW QUALITY: 10 OUT OF 10 PIXELS.', 'Scenery scanned and saved.', 'Beautiful. Taking 14 photos.'],
  ],
  goodbye: [
    ['Finally. Bye.', 'Goodbye, and do not slam the door.', 'Yeah. Bye.'],
    ['Aww, bye bye! Come back soon!', 'See you soon, friend!', 'Goodbye! I will miss you!'],
    ['O-oh. Bye... take care.', 'Goodbye... it was nice talking...', 'Bye... *tiny wave*'],
    ['Parting is such sweet sorrow!', 'Farewell, my dear! Weep for me!', 'Exit, stage left!'],
    ['Fair winds, matey!', 'Farewell, ye landlubber!', 'Arr, until we sail again!'],
    ['GOODBYE. POWERING DOWN FRIENDLINESS.', 'Farewell, human. Beep.', 'See you later, alligator unit.'],
  ],
  secret: [
    ['I do not want to hear it. ...Okay, what?', 'Secrets are for gossips. Go on.', 'Make it quick.'],
    ['Ooh, a secret! Tell me tell me!', 'I will not tell! Probably!', 'Secrets are the best!'],
    ['I am good at keeping secrets...', 'Okay... but whisper...', 'Is it a good secret?'],
    ['A secret?! Gasp! Do tell!', 'Lean in, darling, the walls have ears!', 'I live for secrets!'],
    ['Arr, a secret? Whisper it, matey.', 'I know a secret about a parrot!', 'Keep it from the crew, aye?'],
    ['SECRET STORED. ENCRYPTION: 3 PERCENT.', 'I can keep secrets. Probably.', 'Whisper mode activated. Psst.'],
  ],
  highfive: [
    ['Ugh. Fine.', 'I am not touching your hand. ...Okay, quickly.', 'Smack. There. Happy?'],
    ['HIGH FIVE! Yeah!', 'Up top! Yay!', 'Slap! Best high five ever!'],
    ['Oh... um... okay... *tiny high five*', 'I will try... sorry if I miss...', 'That was scary and nice...'],
    ['A high five for the ages!', 'Our palms shall meet in glory!', 'Give me five, give me ALL of it!'],
    ['High five, arr! Mind me hook!', 'Up top, matey!', 'Slap me five, ye scallywag!'],
    ['HIGH FIVE EXECUTED. 99 PERCENT ACCURACY.', 'Five fingers acquired. All safe.', 'Clap. Beep. Done.'],
  ],
};

//                      grumpy     cheerful   shy       dramatic  pirate    robot
export const ACTIONS = {
  hello:      ['none',   'wave',   'wave',   'wave',   'wave',   'wave'],
  nicehat:    ['none',   'laugh',  'wave',   'dance',  'laugh',  'dance'],
  weather:    ['none',   'wave',   'none',   'dance',  'laugh',  'wave'],
  howdy:      ['none',   'wave',   'none',   'dance',  'laugh',  'wave'],
  bestfriend: ['none',   'follow', 'wave',   'faint',  'laugh',  'dance'],
  hero:       ['laugh',  'dance',  'flee',   'dance',  'wave',   'laugh'],
  oops:       ['shove',  'laugh',  'wave',   'faint',  'laugh',  'wave'],
  bread:      ['none',   'dance',  'follow', 'faint',  'laugh',  'dance'],
  dance:      ['dance',  'dance',  'dance',  'dance',  'dance',  'dance'],
  joke:       ['none',   'laugh',  'laugh',  'laugh',  'laugh',  'laugh'],
  sorry:      ['none',   'wave',   'wave',   'faint',  'laugh',  'wave'],
  challenge:  ['none',   'laugh',  'flee',   'faint',  'laugh',  'wave'],
  gift:       ['follow', 'dance',  'wave',   'faint',  'laugh',  'dance'],
  sparkle:    ['none',   'dance',  'wave',   'dance',  'laugh',  'dance'],
  race:       ['none',   'flee',   'flee',   'flee',   'flee',   'flee'],
  treasure:   ['none',   'follow', 'wave',   'dance',  'laugh',  'wave'],
  view:       ['none',   'wave',   'none',   'faint',  'wave',   'wave'],
  goodbye:    ['none',   'wave',   'wave',   'wave',   'wave',   'wave'],
  secret:     ['none',   'follow', 'wave',   'follow', 'follow', 'wave'],
  highfive:   ['wave',   'laugh',  'wave',   'dance',  'laugh',  'dance'],
};

// Said when the player talks to an NPC that was hit recently
export const HURT_REPLIES = [
  ['You hit me! And now you chat?', 'Not talking to you. Ow.', 'My head still hurts, you know.'],
  ['Ow, my head, but hi!', 'You bonked me! But I forgive you... maybe.', 'Hehe... I am still dizzy!'],
  ['P-please do not hit me again...', 'I am scared of you now...', '*hides behind hands*'],
  ['Betrayer! You struck me!', 'I will never forget this scene!', 'Leave me to my suffering!'],
  ['Ye bonked me, ye scoundrel!', 'Walk the plank fer that!', 'I will remember that, matey!'],
  ['DAMAGE REPORT: YOU. ERROR.', 'Revenge subroutine: loading.', 'Why did you bonk me?'],
];
export const HURT_ACTIONS = ['shove', 'laugh', 'flee', 'faint', 'shove', 'flee'];
export const ZZZ = '...zzz';

export function pickReply(lineId, pIndex, recentlyHit, knockedOut, rnd = Math.random) {
  if (knockedOut) return { text: ZZZ, action: 'none' };
  if (recentlyHit) {
    const pool = HURT_REPLIES[pIndex];
    return { text: pool[Math.floor(rnd() * pool.length)], action: HURT_ACTIONS[pIndex] };
  }
  const pool = REPLIES[lineId]?.[pIndex] || ['...'];
  return { text: pool[Math.floor(rnd() * pool.length)], action: ACTIONS[lineId]?.[pIndex] || 'none' };
}
