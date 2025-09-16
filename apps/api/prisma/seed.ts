 
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const BOOK_JSON = path.join(__dirname, 'seed-data/book.json');
const DICTS_DIR = path.join(__dirname, 'seed-data/dicts');

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

// 统计信息
interface SeedStats {
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
}

const stats: SeedStats = {
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
};

function logProgress(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function logStats() {
  console.log('\n📊 Seed Statistics:');
  console.log(`📚 Books: ${stats.booksCreated} created, ${stats.booksUpdated} updated`);
  console.log(`📝 Words: ${stats.wordsCreated} created, ${stats.wordsUpdated} updated`);
  console.log(`📖 Meanings: ${stats.meaningsCreated} created`);
  console.log(`🔄 Synonyms: ${stats.synonymsCreated} created`);
  console.log(`💬 Sentences: ${stats.sentencesCreated} created`);
  console.log(`📋 Phrases: ${stats.phrasesCreated} created`);
  console.log(`🔗 Relations: ${stats.relationsCreated} created`);
  console.log(`📚 WordBooks: ${stats.wordBooksCreated} created`);

  if (stats.errors.length > 0) {
    console.log(`❌ Errors: ${stats.errors.length}`);
    stats.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error.file}: ${error.error}`);
    });
  }
}

async function processWord(wordData: WordData, bookId: string) {
  const wordContent = wordData.content.word.content;

  // 查找或创建word
  let word = await prisma.word.findFirst({
    where: { headword: wordData.headWord },
  });

  if (!word) {
    word = await prisma.word.create({
      data: {
        headword: wordData.headWord,
        ukPhonetic: wordContent.ukphone || null,
        usPhonetic: wordContent.usphone || null,
        ukAudio: wordContent.ukspeech || null,
        usAudio: wordContent.usspeech || null,
        star: wordContent.star || 0,
      },
    });
    stats.wordsCreated++;
  } else {
    stats.wordsUpdated++;
  }

  // 创建meanings
  if (wordContent.trans) {
    for (const trans of wordContent.trans) {
      const meaning = await prisma.meaning.create({
        data: {
          wordId: word.id,
          partOfSpeech: trans.pos || 'unknown',
          meaningCn: trans.tranCn,
          meaningEn: trans.tranOther || null,
        },
      });
      stats.meaningsCreated++;

      // 创建synonyms
      if (wordContent.syno?.synos) {
        for (const syno of wordContent.syno.synos) {
          if (syno.pos === trans.pos) {
            for (const hwd of syno.hwds) {
              await prisma.synonym.create({
                data: {
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

  // 创建example sentences
  if (wordContent.sentence?.sentences) {
    for (const sentence of wordContent.sentence.sentences) {
      await prisma.exampleSentence.create({
        data: {
          wordId: word.id,
          sentenceEn: sentence.sContent,
          sentenceCn: sentence.sCn,
        },
      });
      stats.sentencesCreated++;
    }
  }

  // 创建phrases
  if (wordContent.phrase?.phrases) {
    for (const phrase of wordContent.phrase.phrases) {
      await prisma.phrase.create({
        data: {
          wordId: word.id,
          phraseText: phrase.pContent,
          phraseCn: phrase.pCn,
        },
      });
      stats.phrasesCreated++;
    }
  }

  // 创建word relations
  if (wordContent.relWord?.rels) {
    for (const rel of wordContent.relWord.rels) {
      for (const relatedWord of rel.words) {
        // 查找或创建相关单词
        let relatedWordRecord = await prisma.word.findFirst({
          where: { headword: relatedWord.hwd },
        });

        if (!relatedWordRecord) {
          relatedWordRecord = await prisma.word.create({
            data: {
              headword: relatedWord.hwd,
              star: 0,
            },
          });
        }

        // 创建关系
        await prisma.wordRelation.create({
          data: {
            wordId: word.id,
            relatedWordId: relatedWordRecord.id,
            relationType: rel.pos,
          },
        });
        stats.relationsCreated++;
      }
    }
  }

  // 创建word-book关联
  await prisma.wordBook.create({
    data: {
      bookId: bookId,
      wordId: word.id,
      wordRank: wordData.wordRank,
    },
  });
  stats.wordBooksCreated++;
}

async function main() {
  logProgress('🌱 Starting seed...');

  try {
    // 检查文件是否存在
    if (!fs.existsSync(BOOK_JSON)) {
      throw new Error(`Book JSON file not found: ${BOOK_JSON}`);
    }

    if (!fs.existsSync(DICTS_DIR)) {
      throw new Error(`Dicts directory not found: ${DICTS_DIR}`);
    }

    // 读取book.json文件
    logProgress('📖 Reading book.json...');
    const bookData: BookData = JSON.parse(fs.readFileSync(BOOK_JSON, 'utf-8'));

    // 创建books
    logProgress('📚 Creating books...');
    for (const bookInfo of bookData.data.normalBooksInfo) {
      try {
        const existingBook = await prisma.book.findUnique({
          where: { id: bookInfo.id },
        });

        if (!existingBook) {
          const book = await prisma.book.create({
            data: {
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
            },
          });
          stats.booksCreated++;
          logProgress(`✅ Created book: ${book.name}`);
        } else {
          stats.booksUpdated++;
          logProgress(`🔄 Book already exists: ${existingBook.name}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        stats.errors.push({
          file: 'book.json',
          error: `Failed to create book ${bookInfo.id}: ${errorMsg}`,
        });
        logProgress(`❌ Failed to create book ${bookInfo.id}: ${errorMsg}`);
      }
    }

    // 处理每个dict文件
    const dictFiles = fs.readdirSync(DICTS_DIR).filter((file) => file.endsWith('.json'));
    logProgress(`📖 Found ${dictFiles.length} dictionary files to process`);

    for (let i = 0; i < dictFiles.length; i++) {
      const dictFile = dictFiles[i];
      const bookId = dictFile.replace('.json', '');
      const dictPath = path.join(DICTS_DIR, dictFile);

      logProgress(`📖 Processing dict file ${i + 1}/${dictFiles.length}: ${dictFile}`);

      try {
        // 检查book是否存在
        const bookExists = await prisma.book.findUnique({
          where: { id: bookId },
        });

        if (!bookExists) {
          logProgress(`⚠️  Book ${bookId} not found, skipping ${dictFile}`);
          continue;
        }

        // 读取dict文件内容
        const dictContent = fs.readFileSync(dictPath, 'utf-8');
        const wordsData: WordData[] = JSON.parse(dictContent) as WordData[];

        // 限制只处理前100条
        const limitedWords = wordsData.slice(0, 100);
        logProgress(`📝 Processing ${limitedWords.length} words from ${dictFile}`);

        // 批量处理单词以提高性能
        for (let j = 0; j < limitedWords.length; j++) {
          const wordData = limitedWords[j];

          try {
            await processWord(wordData, bookId);

            // 每处理10个单词显示一次进度
            if ((j + 1) % 10 === 0) {
              logProgress(`📝 Processed ${j + 1}/${limitedWords.length} words from ${dictFile}`);
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            stats.errors.push({
              file: dictFile,
              error: `Failed to process word ${wordData.headWord}: ${errorMsg}`,
            });
            logProgress(`❌ Failed to process word ${wordData.headWord}: ${errorMsg}`);
          }
        }

        logProgress(`✅ Completed processing ${limitedWords.length} words from ${dictFile}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        stats.errors.push({ file: dictFile, error: errorMsg });
        logProgress(`❌ Error processing ${dictFile}: ${errorMsg}`);
      }
    }

    logStats();
    logProgress('🎉 Seed completed successfully!');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logProgress(`❌ Seed failed: ${errorMsg}`);
    throw error;
  }
}

main()
  .then(() => {
    logProgress('✅ Seed completed');
    return prisma.$disconnect();
  })
  .catch(async (e) => {
    logProgress(`❌ Seed failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    await prisma.$disconnect();
    process.exit(1);
  });
