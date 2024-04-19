// https://suno.com/song/8b6c5dea-ad95-4cf7-a27a-076d77140283

import * as fs from 'fs/promises';
import MP3Tag from 'mp3tag.js';
import { parse } from 'node-html-parser';

async function main() {
  // get first arg
  const arg = process.argv[2];

  const uuid = arg.match(
    /\b[0-9a-f]{8}\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\b[0-9a-f]{12}\b/,
  )[0];
  console.log(uuid);

  const url = `https://suno.com/song/${uuid}`;
  const result = await fetch(url);
  if (!result.ok) {
    console.error('Failed to fetch:', url);
    return;
  }
  const html = await result.text();
  const root = parse(html);

  let pushedData = '';

  // loop over all script tags
  for (const script of root.querySelectorAll('script')) {
    // pritn the text of the script tag
    // console.log(script.text);

    // check if it starts self.__next_f.push([
    if (!script.text.startsWith('self.__next_f.push([')) {
      continue;
    }

    // console.log('Found script:', script.text);

    // get the data from the script tag
    /*
    self.__next_f.push([
        1,
        '$(the data)',
    ]);
    */
    // REGEX: self.__next_f.push\(\[\s*1,\s*'(.*)'\s*\]\);
    // apply multiline flag regex
    const data = script.text.match(
      /\s*self\.__next_f.push\(\[\s*1,\s*"(?<wanted>.*)",?\s*\]\);?/m,
    );
    if (data && data[1]) {
      const better = JSON.parse(`"${data[1]}"`);

      pushedData += better;

      // // split by new line
      // const lines = better.split('\n');
      // for (const line of lines) {
      //   console.log("Line: " + line + "\n")

      //   // Check if starts with "4:", remove 4 parse as json and log
      //   if (line.startsWith('4:')) {
      //     const json = JSON.parse(line.slice(2));

      //     // grab [3].clip
      //     const clip = json[3].clip;

      //     await doSong(clip);
      //   }
      // }
    }
  }

  // console.log(pushedData);

  // find '{"clip":', and cut the string from there
  const start = pushedData.indexOf('{"clip":');
  if (start === -1) {
    console.error('Failed to find clip');
    return;
  }

  const clip = pushedData.slice(start);
  let json = null;
  let endCut = 0;
  try {
    json = JSON.parse(clip);
  } catch (e) {
    // Extract "position $endCut" from the error message
    const position = e.message.match(/position (\d+)/);
    if (position) {
      endCut = parseInt(position[1]);
    } else {
      console.error('Failed to parse json:', e);
      return;
    }

    // Try to parse again with the cut
    try {
      json = JSON.parse(clip.slice(0, endCut));
    } catch (e) {
      console.error('Failed to parse json:', e);
      return;
    }
  }

  // console.log(json);

  doSong(json.clip);
}

/*
example input:
{
  id: '8b6c5dea-ad95-4cf7-a27a-076d77140283',
  video_url: 'https://cdn1.suno.ai/8b6c5dea-ad95-4cf7-a27a-076d77140283.mp4',
  audio_url: 'https://cdn1.suno.ai/8b6c5dea-ad95-4cf7-a27a-076d77140283.mp3',
  image_url: 'https://cdn1.suno.ai/image_819f9e49-1f86-4266-8f17-e42102b518bc.png',
  image_large_url: 'https://cdn1.suno.ai/image_large_819f9e49-1f86-4266-8f17-e42102b518bc.png',
  is_video_pending: false,
  major_model_version: 'v3',
  model_name: 'chirp-v3',
  metadata: {
    tags: 'hard bright dark arab oriental hypnotic percussion cycles electronic,complex polyrhythm,distorted tabla,synth,noise idm ',
    prompt: '\n\n\n\n\n\n\n\n\n\n',
    gpt_description_prompt: null,
    audio_prompt_id: null,
    history: null,
    concat_history: [ [Object], [Object] ],
    type: 'concat',
    duration: 369.95997916666664,
    refund_credits: null,
    stream: null,
    error_type: null,
    error_message: null
  },
  reaction: null,
  display_name: 'MISHKA',
  handle: 'mishka',
  is_handle_updated: true,
  user_id: 'f9e264e2-f1ca-48af-96ab-33e18b625e9e',
  created_at: '2024-04-14T12:12:57.694Z',
  status: 'complete',
  title: 'counter attack',
  play_count: 1104,
  upvote_count: 23,
  is_public: true
}


download the audio_url and apply music metadata to the file
*/

async function doSong(data) {
  // console.log(data);

  const mp3Buffer = await fetch(data.audio_url).then((res) =>
    res.arrayBuffer(),
  );
  const artBuffer = await fetch(data.image_large_url).then((res) =>
    res.arrayBuffer(),
  );

  const tag = new MP3Tag(Buffer.from(mp3Buffer));
  tag.read();
  tag.tags.title = data.title;
  tag.tags.artist = data.display_name;
  tag.tags.genre = data.metadata.tags;
  tag.tags.comment = 'Suno AI';
  tag.tags.year = new Date(data.created_at).getFullYear().toString();
  tag.tags.v2.APIC = [
    {
      format: 'image/jpeg',
      type: 0,
      description: 'Suno AI',
      data: Buffer.from(artBuffer),
    },
  ];

  const filename = `tracks/${data.display_name} - ${data.title}.mp3`;
  await fs.writeFile(
    filename,
    Buffer.from(
      tag.save({
        strict: true, // Strict mode, validates all inputs against the standards. See id3.org
        // ID3v2 Options
        id3v2: { padding: 4096 },
      }),
    ),
  );

  if (tag.error) {
    console.error(tag.error);
  } else {
    console.log('Wrote:', filename);
  }
}

main();
