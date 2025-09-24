// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const BOOK_JSON = path.join(__dirname, 'seed-data/book.json');
const DICTS_DIR = path.join(__dirname, 'seed-data/dicts');

// 批处理大小
const WORD_BATCH_SIZE = 500;

interface BookData {
  reason: string;
  code: number;
  data: {
    normalBooksInfo: Array<{
      id: string;
      title: string;
      introduce: string;
      cover: string;
      wordNum: number;
      reciteUserNum: number;
      version: string;
      size: number;
      offlinedata: string;
      tags: Array<{ tagName: string; tagUrl: string }>;
      bookOrigin: {
        originName: string;
        originUrl: string;
        desc: string;
      };
    }>;
  };
}

interface WordData {
  wordRank: number;
  headWord: string;
  content: {
    word: {
      wordHead: string;
      wordId: string;
      content: {
        sentence?: {
          sentences: Array<{
            sContent: string;
            sCn: string;
          }>;
        };
        syno?: {
          synos: Array<{
            pos: string;
            tran: string;
            hwds: Array<{ w: string }>;
          }>;
        };
        phrase?: {
          phrases: Array<{
            pContent: string;
            pCn: string;
          }>;
        };
        relWord?: {
          rels: Array<{
            pos: string;
            words: Array<{
              hwd: string;
              tran: string;
            }>;
          }>;
        };
        trans: Array<{
          tranCn: string;
          tranOther?: string;
          pos: string;
        }>;
        usphone?: string;
        ukphone?: string;
        usspeech?: string;
        ukspeech?: string;
        star?: number;
      };
    };
  };
  bookId: string;
}

// 优化的统计信息
interface OptimizedSeedStats {
  booksCreated: number;
  booksUpdated: number;
  wordsCreated: number;
  wordsUpdated: number;
  meaningsCreated: number;
  synonymsCreated: number;
  sentencesCreated: number;
  phrasesCreated: number;
  relationsCreated: number;
  wordBooksCreated: number;
  errors: Array<{ file: string; error: string }>;
  totalProcessingTime: number;
  batchesProcessed: number;
}

const stats: OptimizedSeedStats = {
  booksCreated: 0,
  booksUpdated: 0,
  wordsCreated: 0,
  wordsUpdated: 0,
  meaningsCreated: 0,
  synonymsCreated: 0,
  sentencesCreated: 0,
  phrasesCreated: 0,
  relationsCreated: 0,
  wordBooksCreated: 0,
  errors: [],
  totalProcessingTime: 0,
  batchesProcessed: 0,
};

// 内存缓存，避免重复查询
const wordCache = new Map<string, { id: string; exists: boolean }>();
const bookCache = new Map<string, boolean>();

function logProgress(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function logStats() {
  console.log('\n📊 Optimized Seed Statistics:');
  console.log(
    `📚 Books: ${stats.booksCreated} created, ${stats.booksUpdated} updated`,
  );
  console.log(
    `📝 Words: ${stats.wordsCreated} created, ${stats.wordsUpdated} updated`,
  );
  console.log(`📖 Meanings: ${stats.meaningsCreated} created`);
  console.log(`🔄 Synonyms: ${stats.synonymsCreated} created`);
  console.log(`💬 Sentences: ${stats.sentencesCreated} created`);
  console.log(`📋 Phrases: ${stats.phrasesCreated} created`);
  console.log(`🔗 Relations: ${stats.relationsCreated} created`);
  console.log(`📚 WordBooks: ${stats.wordBooksCreated} created`);
  console.log(`⚡ Batches processed: ${stats.batchesProcessed}`);
  console.log(
    `⏱️  Total processing time: ${stats.totalProcessingTime.toFixed(2)}s`,
  );

  if (stats.errors.length > 0) {
    console.log(`❌ Errors: ${stats.errors.length}`);
    stats.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error.file}: ${error.error}`);
    });
  }
}

// 预加载现有单词到缓存
async function preloadWordCache() {
  logProgress('🔄 Preloading word cache...');
  const startTime = Date.now();

  const existingWords = await prisma.word.findMany({
    select: { id: true, headword: true },
  });

  for (const word of existingWords) {
    wordCache.set(word.headword, { id: word.id, exists: true });
  }

  const loadTime = (Date.now() - startTime) / 1000;
  logProgress(
    `✅ Loaded ${existingWords.length} words to cache in ${loadTime.toFixed(2)}s`,
  );
}

// 预加载现有书籍到缓存
async function preloadBookCache() {
  logProgress('🔄 Preloading book cache...');
  const existingBooks = await prisma.book.findMany({
    select: { id: true },
  });

  for (const book of existingBooks) {
    bookCache.set(book.id, true);
  }

  logProgress(`✅ Loaded ${existingBooks.length} books to cache`);
}

// 批量处理单词数据
async function processBatchWords(wordsData: WordData[], bookId: string) {
  const batchStartTime = Date.now();

  // 准备批量插入的数据
  const wordsToCreate: Array<{
    headword: string;
    ukPhonetic: string | null;
    usPhonetic: string | null;
    ukAudio: string | null;
    usAudio: string | null;
    star: number;
  }> = [];

  const meaningsToCreate: Array<{
    wordId: string;
    partOfSpeech: string;
    meaningCn: string;
    meaningEn: string | null;
  }> = [];

  const sentencesToCreate: Array<{
    wordId: string;
    sentenceEn: string;
    sentenceCn: string;
  }> = [];

  const phrasesToCreate: Array<{
    wordId: string;
    phraseText: string;
    phraseCn: string;
  }> = [];

  const wordBooksToCreate: Array<{
    bookId: string;
    wordId: string;
    wordRank: number;
  }> = [];

  // 第一步：识别需要创建的新单词
  const newWords: Array<{ headword: string; wordData: WordData }> = [];

  for (const wordData of wordsData) {
    const cached = wordCache.get(wordData.headWord);
    if (!cached || !cached.exists) {
      newWords.push({ headword: wordData.headWord, wordData });

      const wordContent = wordData.content.word.content;
      wordsToCreate.push({
        headword: wordData.headWord,
        ukPhonetic: wordContent.ukphone || null,
        usPhonetic: wordContent.usphone || null,
        ukAudio: wordContent.ukspeech || null,
        usAudio: wordContent.usspeech || null,
        star: wordContent.star || 0,
      });
    }
  }

  // 批量创建新单词
  let createdWords: { id: string; headword: string }[] = [];
  if (wordsToCreate.length > 0) {
    try {
      createdWords = await prisma.word.createManyAndReturn({
        data: wordsToCreate,
        select: { id: true, headword: true },
      });

      // 更新缓存
      for (const word of createdWords) {
        wordCache.set(word.headword, { id: word.id, exists: true });
      }

      stats.wordsCreated += createdWords.length;
      logProgress(`✅ Created ${createdWords.length} new words`);
    } catch (error) {
      logProgress(
        `❌ Error creating words: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return;
    }
  }

  // 第二步：为所有单词（新建和现有）准备相关数据
  for (const wordData of wordsData) {
    const cached = wordCache.get(wordData.headWord);
    if (!cached) continue;

    const wordId = cached.id;
    const wordContent = wordData.content.word.content;

    // 准备 meanings 数据 - 使用Set去重
    if (wordContent.trans) {
      const meaningKeys = new Set<string>();
      for (const trans of wordContent.trans) {
        const key = `${wordId}-${trans.pos || 'unknown'}-${trans.tranCn}`;
        if (!meaningKeys.has(key)) {
          meaningKeys.add(key);
          meaningsToCreate.push({
            wordId,
            partOfSpeech: trans.pos || 'unknown',
            meaningCn: trans.tranCn,
            meaningEn: trans.tranOther || null,
          });
        }
      }
    }

    // 准备例句数据 - 使用Set去重
    if (wordContent.sentence?.sentences) {
      const sentenceKeys = new Set<string>();
      for (const sentence of wordContent.sentence.sentences) {
        const key = `${wordId}-${sentence.sContent}`;
        if (!sentenceKeys.has(key)) {
          sentenceKeys.add(key);
          sentencesToCreate.push({
            wordId,
            sentenceEn: sentence.sContent,
            sentenceCn: sentence.sCn,
          });
        }
      }
    }

    // 准备短语数据 - 使用Set去重
    if (wordContent.phrase?.phrases) {
      const phraseKeys = new Set<string>();
      for (const phrase of wordContent.phrase.phrases) {
        const key = `${wordId}-${phrase.pContent}`;
        if (!phraseKeys.has(key)) {
          phraseKeys.add(key);
          phrasesToCreate.push({
            wordId,
            phraseText: phrase.pContent,
            phraseCn: phrase.pCn,
          });
        }
      }
    }

    // 准备 word-book 关联数据
    wordBooksToCreate.push({
      bookId,
      wordId,
      wordRank: wordData.wordRank,
    });
  }

  // 第三步：使用事务批量插入所有相关数据
  try {
    await prisma.$transaction(async (tx) => {
      // 批量创建 meanings - 使用upsert避免重复
      if (meaningsToCreate.length > 0) {
        for (const meaning of meaningsToCreate) {
          await tx.meaning.upsert({
            where: {
              wordId_partOfSpeech_meaningCn: {
                wordId: meaning.wordId,
                partOfSpeech: meaning.partOfSpeech,
                meaningCn: meaning.meaningCn,
              },
            },
            update: {
              meaningEn: meaning.meaningEn,
            },
            create: meaning,
          });
        }
        stats.meaningsCreated += meaningsToCreate.length;
      }

      // 批量创建例句 - 使用upsert避免重复
      if (sentencesToCreate.length > 0) {
        for (const sentence of sentencesToCreate) {
          await tx.exampleSentence.upsert({
            where: {
              wordId_sentenceEn: {
                wordId: sentence.wordId,
                sentenceEn: sentence.sentenceEn,
              },
            },
            update: {
              sentenceCn: sentence.sentenceCn,
            },
            create: sentence,
          });
        }
        stats.sentencesCreated += sentencesToCreate.length;
      }

      // 批量创建短语 - 使用upsert避免重复
      if (phrasesToCreate.length > 0) {
        for (const phrase of phrasesToCreate) {
          await tx.phrase.upsert({
            where: {
              wordId_phraseText: {
                wordId: phrase.wordId,
                phraseText: phrase.phraseText,
              },
            },
            update: {
              phraseCn: phrase.phraseCn,
            },
            create: phrase,
          });
        }
        stats.phrasesCreated += phrasesToCreate.length;
      }

      // 批量创建 word-book 关联
      if (wordBooksToCreate.length > 0) {
        await tx.wordBook.createMany({
          data: wordBooksToCreate,
          skipDuplicates: true,
        });
        stats.wordBooksCreated += wordBooksToCreate.length;
      }
    });

    // 第四步：处理同义词（需要在meanings创建完成后）
    await processSynonyms(wordsData);

    const batchTime = (Date.now() - batchStartTime) / 1000;
    stats.batchesProcessed++;
    logProgress(
      `✅ Processed batch of ${wordsData.length} words in ${batchTime.toFixed(2)}s`,
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logProgress(`❌ Error in batch transaction: ${errorMsg}`);
    stats.errors.push({ file: bookId, error: errorMsg });
  }
}

// 处理同义词的函数
async function processSynonyms(wordsData: WordData[]) {
  for (const wordData of wordsData) {
    const cached = wordCache.get(wordData.headWord);
    if (!cached) continue;

    const wordId = cached.id;
    const wordContent = wordData.content.word.content;

    // 处理同义词数据
    if (wordContent.syno?.synos) {
      for (const syno of wordContent.syno.synos) {
        // 查找对应的meaning
        const meaning = await prisma.meaning.findFirst({
          where: {
            wordId: wordId,
            partOfSpeech: syno.pos || 'unknown',
            meaningCn: syno.tran,
          },
        });

        if (meaning && syno.hwds) {
          // 为每个同义词创建记录
          for (const hwd of syno.hwds) {
            if (hwd.w) {
              await prisma.synonym.upsert({
                where: {
                  meaningId_synonymText: {
                    meaningId: meaning.id,
                    synonymText: hwd.w,
                  },
                },
                update: {},
                create: {
                  meaningId: meaning.id,
                  synonymText: hwd.w,
                },
              });
              stats.synonymsCreated++;
            }
          }
        }
      }
    }
  }
}

// 分块处理函数
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function main() {
  const totalStartTime = Date.now();
  logProgress('🚀 Starting optimized seed...');

  try {
    // 检查文件是否存在
    if (!fs.existsSync(BOOK_JSON)) {
      throw new Error(`Book JSON file not found: ${BOOK_JSON}`);
    }

    if (!fs.existsSync(DICTS_DIR)) {
      throw new Error(`Dicts directory not found: ${DICTS_DIR}`);
    }

    // 预加载缓存
    await preloadWordCache();
    await preloadBookCache();

    // 读取book.json文件
    logProgress('📖 Reading book.json...');
    const bookData: BookData = JSON.parse(fs.readFileSync(BOOK_JSON, 'utf-8'));

    // 批量创建books
    logProgress('📚 Creating books...');
    const booksToCreate = bookData.data.normalBooksInfo.filter(
      (bookInfo) => !bookCache.has(bookInfo.id),
    );

    if (booksToCreate.length > 0) {
      try {
        await prisma.book.createMany({
          data: booksToCreate.map((bookInfo) => ({
            id: bookInfo.id,
            name: bookInfo.title,
            introduce: bookInfo.introduce,
            coverUrl: bookInfo.cover,
            tags: bookInfo.tags.map((tag) => tag.tagName),
            originName: bookInfo.bookOrigin.originName,
            version: bookInfo.version,
            wordNum: bookInfo.wordNum,
            reciteUserNum: bookInfo.reciteUserNum,
            offlinedata: bookInfo.offlinedata,
            size: bookInfo.size,
          })),
          skipDuplicates: true,
        });
        stats.booksCreated += booksToCreate.length;
        logProgress(`✅ Created ${booksToCreate.length} books`);
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : 'Unknown error';
        logProgress(`❌ Error creating books: ${errorMsg}`);
        stats.errors.push({ file: 'book.json', error: errorMsg });
      }
    }

    // 处理字典文件
    const dictFiles = fs
      .readdirSync(DICTS_DIR)
      .filter((file) => file.endsWith('.json'));
    logProgress(`📖 Found ${dictFiles.length} dictionary files to process`);

    for (let i = 0; i < dictFiles.length; i++) {
      const dictFile = dictFiles[i];
      const bookId = dictFile.replace('.json', '');
      const dictPath = path.join(DICTS_DIR, dictFile);

      logProgress(
        `📖 Processing dict file ${i + 1}/${dictFiles.length}: ${dictFile}`,
      );

      try {
        // 检查book是否存在（使用缓存）
        if (!bookCache.has(bookId)) {
          logProgress(`⚠️  Book ${bookId} not found, skipping ${dictFile}`);
          continue;
        }

        // 读取dict文件内容
        const dictContent = fs.readFileSync(dictPath, 'utf-8');
        const wordsData: WordData[] = JSON.parse(dictContent) as WordData[];

        logProgress(`📝 Processing ${wordsData.length} words from ${dictFile}`);

        // 分批处理单词
        const wordChunks = chunkArray(wordsData, WORD_BATCH_SIZE);

        for (let chunkIndex = 0; chunkIndex < wordChunks.length; chunkIndex++) {
          const chunk = wordChunks[chunkIndex];

          logProgress(
            `📝 Processing chunk ${chunkIndex + 1}/${wordChunks.length} (${chunk.length} words) from ${dictFile}`,
          );

          await processBatchWords(chunk, bookId);
        }

        logProgress(
          `✅ Completed processing ${wordsData.length} words from ${dictFile}`,
        );
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : 'Unknown error';
        stats.errors.push({ file: dictFile, error: errorMsg });
        logProgress(`❌ Error processing ${dictFile}: ${errorMsg}`);
      }
    }

    stats.totalProcessingTime = (Date.now() - totalStartTime) / 1000;
    logStats();
    logProgress('🎉 Optimized seed completed successfully!');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logProgress(`❌ Seed failed: ${errorMsg}`);
    throw error;
  }
}

main()
  .then(() => {
    logProgress('✅ Optimized seed completed');
    return prisma.$disconnect();
  })
  .catch(async (e) => {
    logProgress(
      `❌ Seed failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
    );
    await prisma.$disconnect();
    process.exit(1);
  });
