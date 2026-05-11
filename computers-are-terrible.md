---
tags: post
title: Computers Are Terrible
description: Oh well, my day is ruined
date: 2026-05-10
layout: default
---

A slightly more collected version of originally 18 Signal messages. This is a simplification. I am evidently no expert in Unicode specifically or text encoding in general.

I, for a long time, believed that while many modern standards are a mess of legacy compatibility built on legacy compatibility, Unicode was an exception. That the only compromise it made was ASCII-compatibility, but even that wasn’t such a big one given that its character set is the most common one in computing even to this day. I was wrong.

I got a US keyboard so now I have 2 different ways of typing accented characters. I can either hold the <kbd>A</kbd> key until I get an option of `à`, `á`, `â`, `ä`, `ǎ`, etc., or I can press <kbd>⌥</kbd> <kbd>E</kbd> and then <kbd>A</kbd> to get to `á`, combining `´` and a regular `a`. I started wondering… when typing it one way or the other, the results must be different, right? I looked for a website that showed me what code points I was typing, and… they were the same?

Most systems (the OS/browser in this case) normalize all text either one way or the other. In this case, to a single code point. Unicode does have deprecation, so you would think that when they introduced combining characters, they would have deprecated the precomposed versions of characters that can be written using them, right? Nope!

It’s arbitrary which way each system normalizes text. Some do it *composed* (`á`) and some *decomposed* (`a` + `◌́`). Both are part of the standard. And of course, you need to treat them as equivalent when not normalized so you might as well do it when you can anyway.

<figure>
  <blockquote>
    <p>
      Precomposed characters are the legacy solution for representing many special letters in various character sets. In Unicode, they were included for compatibility with early encoding systems […].
    </p>
  </blockquote>
  <figcaption>
    From
    <cite
      ><a href="https://en.wikipedia.org/wiki/Precomposed_character"
        >Precomposed character - Wikipedia</a
      ></cite
    >
  </figcaption>
</figure>

Oh well, my day is ruined. My new life goal is advocacy for the deprecation of all precomposed characters… or maybe I should just accept that all computing will be plagued by backwards compatibility headaches ’til the end of time.
