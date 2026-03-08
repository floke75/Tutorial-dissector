import ytdl from '@distube/ytdl-core';

async function test() {
  try {
    const info = await ytdl.getInfo('https://www.youtube.com/watch?v=jNQXAC9IVRw');
    console.log("Duration:", info.videoDetails.lengthSeconds);
    const format = ytdl.chooseFormat(info.formats, { quality: 'highestvideo', filter: 'videoonly' });
    console.log("URL:", format.url);
  } catch (e) {
    console.error(e);
  }
}

test();
