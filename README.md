# Udacity Reviews History

### Steps to get this working

1. Open the [Live Version](https://raafaelima.github.io/udacity-reviews-list/).
  * If you have already used this in the past and there has been an update, remember to force a refresh without browser cache.  
  The method for that depends but it is generally one of the following:
  ```
  Windows: ctrl + F5 or shift + F5
  Mac/Apple: Apple + R or command + R
  Linux: F5
  ```
2. Open the [Udacity reviewer dashboard](https://review.udacity.com/#!/submissions/dashboard) and make sure you are logged in
3. Get your token from the [API Access](https://review.udacity.com/) section.
4. Paste the token to editText and hit enter
5. Your data will be stored locally on your pc.
  * If you refresh after the first use you should see a button that says `Load locally stored data you last used`.
  * This will not pull fresh data from Udacity but it will let you see your last loaded data without getting it and pasting it again.
  
### The following information is presented

* Review id
  * id is the default sort item and is in descending order
  * a click on the id will opan a modal with detail information and links to the original review, zip file, and more.
* Date of review completion
  * Dates are in local format thanks to momentjs
  * The completion time for this project shows as a popover on hovering over the completion date
* Price associated with the review at the time it was completed
* Result of the review
  * If the student left feedback, this will have a popover on hover containing the rating and any feedback note
* The name of the project reviewed

#### Basic overall stats are shown on the navbar / header

* Total count of reviews (dropdown menu shows total per project and %)
* Total earned amount
  * Dropdown menu shows total per project and %
* Average earned per review
* Average time from assigned to completion
  * Dropdown menu shows average per project and % comparison of averages
* Earliest review date
* Most recent review date.

### License

The MIT License (MIT)

Copyright (c) Rafael Lima

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
