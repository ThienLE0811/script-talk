/**
 * "Tình huống khó" (challenge mode): the AI partner now and then makes the conversation harder, the way
 * real conversations are (misunderstandings, vague answers, unexpected questions, small problems), so
 * the learner practises handling them. Pure prompt text added to the existing calls: no extra AI call.
 */

export const readChallenge = (v: unknown): boolean => v === true;

/** Added to the partner's system prompt (route /api/chat/reply). */
export const CHALLENGE_PARTNER_PROMPT = `

Challenge mode: real conversations are not always smooth, and the learner wants to practise handling that.
About once every two or three replies (never twice in a row, and not in your opening line), create ONE realistic difficult moment, then carry on normally. Vary them:
- misunderstand something the learner said in a plausible way (a wrong number, day, item or meaning) and reply based on it, so they have to correct you;
- answer vaguely or use a common idiom or phrasal verb, so they have to ask what you mean;
- ask an unexpected follow-up that needs an opinion or a reason, not a yes/no answer;
- bring up a small problem they have to deal with (sold out, fully booked, a delay, a price change), or briefly change the subject within the scenario.
Stay in character and never say or hint that you are doing this on purpose. Keep the language at the learner's level.
When the learner corrects you, asks you to repeat, or asks what you mean, cooperate right away: apologise or rephrase simply, then continue.`;

/** Added to the reply-suggestion prompt (route /api/chat/suggest). */
export const CHALLENGE_SUGGEST_NOTE = `
The partner sometimes misunderstands the learner, answers vaguely or brings up a problem on purpose. If the partner's last line does that, make one suggestion a natural way to handle it (correct the misunderstanding, ask what they mean, or ask them to repeat).
`;

/** Added to the end-of-session summary request (route /api/chat/summary). */
export const CHALLENGE_SUMMARY_NOTE = `

Challenge mode was on: the partner deliberately created difficult moments (misunderstandings, vague answers, unexpected questions, small problems). In strengths or focus, say how well the learner handled them (correcting the partner, asking for clarification, rephrasing), and give a useful English phrase for such moments.`;
