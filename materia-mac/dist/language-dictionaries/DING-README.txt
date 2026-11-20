# ding

## Description
This is "Ding"
  * A dictionary lookup program for Unix
  * DIctionary Nice Grep
  * A Tk based Front-End to [ae]grep, ispell, dict, ...
  * Ding {n} :: thing

Ding contains a program "ding" and a German-English dictionary 
(more than 368,000 entries).

## COPYRIGHT / LICENSE
Copyright (c) Frank Richter <frank.richter@hrz.tu-chemnitz.de> 1999 - 2020
Distributed under the GNU public license (GPL), see file "COPYING" for details  
Ding comes with ABSOLUTELY NO WARRANTY.

## INSTALL
  To install it on Linux (RPM based, such as Fedora, Red Hat, SuSe ...):
```
    % rpm -Uhv ding-1.9-1.noarch.rpm`
```

  To install it on other Unix systems:
```
    % gzip -dc ding-1.9.tar.gz | tar -xvf -
    % cd ding-1.9
```
  Then simply run (as root, if you want to install in system directories):
```
    % ./install.sh;
```
  To install it manually: 

Edit ding and change some options explained there, esp. the location
of the dictionary file.

```
    % cp ding /your/bin/dir
    % cp de-en.txt /your/lib/dir
```
  You may install the icons and / or KDE/Gnome destop file
  to make "ding" available to your desktop.

  I hope you will enjoy "ding"!

## DICTIONARY
The German-English dictionary file "de-en.txt" has been maintained 
over the last twenty years. All your comments are welcome. In fact, 
your questions, comments, corrections, and new words are the source 
where this dictionary evolves from. Keep them going...

Beware: I tried my best, but accuracy is not guaranteed!

For news ("der letzte Stand der Dinge") see https://dict.tu-chemnitz.de/  
and https://www-user.tu-chemnitz.de/~fri/ding/

Thanks to all of you who helped to improve this dictionary,
thanks to the Tcl/Tk and all Open Source Software developers!


Frank Richter <frank.richter@hrz.tu-chemnitz.de>
