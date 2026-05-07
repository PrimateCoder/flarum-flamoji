/*
 * This file is part of Flamoji.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

// JavaScript way to check if the path starts with http:// or https://
// We're using a similar thing on the ConfigureTextFormatter.php
export default function urlChecker(url) {
  const regex = new RegExp('^(http|https)://', 'i');

  if (url.match(regex)) return true;

  return false;
}
