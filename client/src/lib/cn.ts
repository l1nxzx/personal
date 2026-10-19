export const cn = (...classes: Array<string | false | null | undefined | 0>) =>
  classes.filter(Boolean).join(' ');
