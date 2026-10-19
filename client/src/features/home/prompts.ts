/**
 * Reflection prompts. Plain questions, no motivational tone. One per day, chosen by date so it
 * stays the same across devices and reloads.
 */
export const PROMPTS = [
  'What has been on your mind lately?',
  'What happened today that you want to remember?',
  'What is something you understand differently now than a year ago?',
  'What would you like to make progress on this week?',
  'What did you learn today, however small?',
  'What is something you want to understand better?',
  'What has changed in your life since the beginning of this year?',
  'Which conversation from the past few days is still with you?',
  'What are you unsure about at the moment?',
  'What did you spend most of your attention on today? Was it worth it?',
  'Is there a belief you hold that you have never really examined?',
  'What are you grateful for that you usually take for granted?',
  'What would you tell yourself from five years ago?',
  'What is a question you keep coming back to?',
  'What did you read or hear recently that stayed with you?',
  'What made today different from yesterday?',
  'Where did your money and time actually go this week?',
  'What are you avoiding, and why?',
  'Who do you want to be more like, and in what way?',
  'What is working well right now?',
  'What is something you changed your mind about?',
  'What does a good ordinary day look like for you?',
  'What would make next week feel well spent?',
  'What do you want to remember about this period of your life?',
  'What argument against your own view do you find hardest to answer?',
  'What small thing went better than expected?',
  'What are you looking forward to?',
  'If you had a free afternoon tomorrow, how would you spend it?',
  'What have you been putting off deciding?',
  'What is one thing you would like to learn this year?',
];

export function promptFor(date: string): string {
  let h = 0;
  for (const ch of date) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PROMPTS[h % PROMPTS.length]!;
}
