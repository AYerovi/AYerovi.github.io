---
layout: archive
title: "CV"
permalink: /cv/
author_profile: true
redirect_from:
  - /resume
---

{% include base_path %}

Education
======
* Ph.D. in Economics, Technical University of Munich (in progress)
* M.Sc. in Quantitative Economics, Erasmus Mundus Joint Master's Degree
  * Specialization in mathematical economics
  * Thesis on network formation theory, supervised by Philippe Bich

Research interests
======
* Behavioral economics
* Experimental methods
* Environmental and climate behavior

Teaching
======
  <ul>{% for post in site.teaching reversed %}
    {% include archive-single-cv.html %}
  {% endfor %}</ul>
