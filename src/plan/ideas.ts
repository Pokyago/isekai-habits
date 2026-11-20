/**
 * Ready-made goals to pick from when planning a day, so a plan can be put together
 * by clicking instead of typing. Each becomes an ordinary goal on the day.
 */
export const GOAL_IDEAS: { area: string; ideas: string[] }[] = [
  {
    area: 'Work & focus',
    ideas: [
      'Two hours of deep work',
      'Finish the hardest task first',
      'Clear the inbox',
      'Plan the week',
      'Prepare for a meeting',
      'Back up my files',
    ],
  },
  {
    area: 'Study',
    ideas: ['Study for one hour', 'Review my notes', 'Do a practice test', 'Practise a language', 'Finish a chapter'],
  },
  {
    area: 'Home',
    ideas: [
      'Tidy the desk',
      'Do the laundry',
      'Clean the kitchen',
      'Take out the rubbish',
      'Cook a proper meal',
      'Buy groceries',
      'Change the bed sheets',
    ],
  },
  {
    area: 'Body',
    ideas: ['Go to the gym', 'Go for a long walk', 'Stretch for 15 minutes', 'Prepare healthy meals', 'Go to bed early'],
  },
  {
    area: 'Money & errands',
    ideas: ['Pay the bills', 'Record this week’s spending', 'Book an appointment', 'Go to the bank', 'Go to the pharmacy', 'Cancel something I don’t use'],
  },
  {
    area: 'People',
    ideas: ['Call my family', 'Meet a friend', 'Reply to messages', 'Time with my partner', 'Walk the dog'],
  },
  {
    area: 'Rest & fun',
    ideas: ['An evening without screens', 'Read for an hour', 'Play a game guilt-free', 'Watch a film', 'Time on a hobby', 'Do nothing for a while'],
  },
];
