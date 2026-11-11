import { beforeEach, vi } from 'vitest';
import {
  bookRepo,
  documentRepo,
  entryRepo,
  folderRepo,
  inboxRepo,
  incomeRepo,
  linkRepo,
  prefsRepo,
  projectRepo,
  refreshTokenRepo,
  resetMemory,
  storage,
  taskRepo,
  userRepo,
  versionRepo,
} from './memory.js';
import {
  activityRepo,
  expenseRepo,
  momentRepo,
  moneyIdeaRepo,
  reviewRepo,
  statsRepo,
  vaultRepo,
  entryLockRepo,
} from './memory3.js';

// Replace the Firebase-backed data layer so tests need no credentials or network.
vi.mock('../src/data/userRepo.js', () => userRepo);
vi.mock('../src/data/refreshTokenRepo.js', () => refreshTokenRepo);
vi.mock('../src/data/entryRepo.js', () => entryRepo);
vi.mock('../src/data/taskRepo.js', () => taskRepo);
vi.mock('../src/data/inboxRepo.js', () => inboxRepo);
vi.mock('../src/data/prefsRepo.js', () => prefsRepo);
vi.mock('../src/data/linkRepo.js', () => linkRepo);
vi.mock('../src/data/bookRepo.js', () => bookRepo);
vi.mock('../src/data/projectRepo.js', () => projectRepo);
vi.mock('../src/data/documentRepo.js', () => documentRepo);
vi.mock('../src/data/folderRepo.js', () => folderRepo);
vi.mock('../src/data/incomeRepo.js', () => incomeRepo);
vi.mock('../src/data/versionRepo.js', () => versionRepo);
vi.mock('../src/data/moneyIdeaRepo.js', () => moneyIdeaRepo);
vi.mock('../src/data/expenseRepo.js', () => expenseRepo);
vi.mock('../src/data/reviewRepo.js', () => reviewRepo);
vi.mock('../src/data/momentRepo.js', () => momentRepo);
vi.mock('../src/data/vaultRepo.js', () => vaultRepo);
vi.mock('../src/data/entryLockRepo.js', () => entryLockRepo);
vi.mock('../src/data/statsRepo.js', () => statsRepo);
vi.mock('../src/data/activityRepo.js', () => activityRepo);
vi.mock('../src/data/storage.js', () => storage);

beforeEach(() => resetMemory());
