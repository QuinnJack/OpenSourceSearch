import { FORENSICS_BASE_PATH, FORENSICS_STATIC_PATH } from "./forensicsPaths";

export function ForensicsApp() {
  return (
    <div className="app" data-forensics-app="root">
      <div className="app-header">
        <img
          src={`${FORENSICS_STATIC_PATH}/logo-32-BuOnTly2.png`}
          srcSet={`${FORENSICS_STATIC_PATH}/logo-64-b-WwUPxY.png 2x, ${FORENSICS_STATIC_PATH}/logo-128-DoT-fjRK.png 4x`}
          className="logo"
        />
        <a href={`${FORENSICS_BASE_PATH}/index.html`}>
          <h1>Forensically<sup><small>&nbsp;&beta;eta</small></sup>
          </h1>
        </a>
        <div className="upload-action link">Open File
          <input type="file" name="file" accept="image/*" />
        </div>
        <div className="upload-action icon">
          <div className="icon-picture"></div>
          <input type="file" name="file" accept="image/*" />
        </div>
        <div className="help-action link">Help</div>
        <div className="help-action icon">
          <div className="icon-help-circled"></div>
        </div>
        <div className="toolbox-action icon">
          <div className="icon-th-list"></div>
        </div>
      </div>
      <div className="app-content">
        <div className="analysis">
          <div className="analysis-output">
            <div className="analysis-output-frame">
              <div className="analysis-output-image hidden">
                <div className="analysis-output-layers"></div>
                <canvas className="analysis-output-canvas"></canvas>
              </div>
            </div>
          </div>
          <div className="analysis-sidebar">
            <div className="toolbox">
              <div className="editor-control-selector"></div>
            </div>
          </div>
        </div>
      </div>
      <div className="app-modals">
        <div className="app-modal">
          <div className="dialog help">
            <div className="dialog-title">
              <h1>About Forensically</h1>
              <div className="dialog-close dialog-close-action">&times;</div>
            </div>
            <div className="dialog-body">
              <p>Forensically is a set of free tools for digital image forensics. It includes clone detection, error level analysis, meta data extraction and more. It is made by <a href="http://29a.ch/">Jonas Wagner</a>.
                You can read a bit more about it in this <a href="https://29a.ch/2015/08/16/forensically-photo-forensics-for-the-web">blog post</a>.
              </p>
              <p><em>
                You should think of forensically as a kind of magnifying glass.
                It helps you to see details that would otherwise be hidden.
                Just like a magnifying glass it can't tell true from false or good from evil,
                but it might just help you to uncover the truth.</em></p>
              <p>
                Also <a href="https://en.wikipedia.org/wiki/Argument_from_ignorance#Absence_of_evidence">absence of evidence is still not evidence of absence</a>
                and <a href="http://rationalwiki.org/wiki/Extraordinary_claims_require_extraordinary_evidence">Extraordinary claims require extraordinary evidence</a>.
              </p>
              <p className="offline-available hidden"><strong>Offline mode enabled. </strong>You can use this application while offline.</p>
              <h2>Tutorial Video</h2>
              <a href="https://www.youtube.com/watch?v=XRCq8CJrI_s" target="_blank" rel="noreferrer noopener">
                <img src={`${FORENSICS_STATIC_PATH}/video-C30cji6v.webp`} width="458" />
              </a>
              <h1>The Tools</h1>
              <h2>Magnifier</h2>
              <p>
                The magnifier allows you to see small hidden details in an image.
                It does this by magnifying the size of the pixels and the contrast within the window.
              </p>
              <p><strong className="help-parameter">Magnification</strong>Also known as the zoom factor.</p>
              <p><strong className="help-parameter">Enhancement</strong>There are three different enhancements available at the moment. <a href="https://en.wikipedia.org/wiki/Histogram_equalization">Histogram Equalization</a>, Auto Contrast and Auto Contrast by Channel. Auto Contrast mostly keeps the colors intact, the others can cause color shifts. Histogram Equalization is the most robost option. You can also set this to none.</p>
              <h2>Clone Detection</h2>
              <p>
                The clone detector highlights similar regions within an image. These can be a good indicator that a picture
                has been manipulated using the clone tool. Note that this tool is a first attempt and not yet very refined.
              </p>
              <p>
                Regions that are similar are marked in blue and connected with a red line.
                If a lot of regions overlap the result can look white.
              </p>
              <p> <strong className="help-parameter">Minimal Similarity</strong>Determines how similar the cloned pixels need to be to the original.</p>
              <p><strong className="help-parameter">Minimal Detail</strong>Blocks with less detail than this are not considered when searching for clones.</p>
              <p><strong className="help-parameter">Minimal Cluster Size</strong>Determines how many clones of a similar region need to be found in order for them to show up as results.</p>
              <p><strong className="help-parameter">Blocksize (2<sup>n</sup>)</strong>Determines how big the blocks used for the clone detection are.
                You generally don't want to touch this.
              </p>
              <p><strong className="help-parameter">Maximal Image Size</strong>The maximal width or height of the image used to perform the clone search. Bigger images take longer to analyze.</p>
              <p><strong className="help-parameter">Show Quantized Image</strong>Shows the image after it has been compressed. Can be useful to tweak <em>Minimal Similarity</em> and <em>Minimal Detail</em>. Blocks that have been rejected because they do not have enough detail show up as black.</p>
              <h2>Error Level Analysis</h2>
              <p>
                This tool compares the original image to a recompressed version.
                This can make manipulated regions stand out in various ways.
                For example they can be darker or brighter than similar regions which
                have not been manipulated.
              </p>
              <p>There is a good tutorial on ELA on <a href="http://fotoforensics.com/tutorial-ela.php">fotoforensics.com</a>.</p>
              <p><em>The results of this tool can be misleading, watch the video and read the tutoria for details.</em></p>
              <p><strong className="help-parameter">JPEG Quality</strong>This should match the original quality of the image that has been photoshopped.</p>
              <p><strong className="help-parameter">Error Scale</strong>Makes the differences between the original and the recompressed image bigger</p>
              <p><strong className="help-parameter">Magnifier Enhancement</strong>There are three different enhancements available at the moment. <a href="https://en.wikipedia.org/wiki/Histogram_equalization">Histogram Equalization</a>, Auto Contrast and Auto Contrast by Channel. Auto Contrast mostly keeps the colors intact, the others can cause color shifts. Histogram Equalization is the most robost option. You can also set this to none.</p>
              <p><strong className="help-parameter">Opacity</strong>The opacity of the differences layer. If you lower it you will see more of the original image.</p>
              <h2>Noise Analysis</h2>
              <p>
                This is tool is basically a reverse denoising algorithm. Rather than
                removing the noise it removes the rest of the image.
                It is using a super simple separable median filter to isolate the noise.
                It can be useful for identifying manipulations to the image like
                airbrushing, deformations, warping and perspective corrected cloning.
                It works best on high quality images. Smaller images tend to contain to
                little information for this to work.
                You can read more about noise analysis in my blog post <a href="https://29a.ch/2015/08/21/noise-analysis-for-image-forensics/">Noise Analysis for Image Forensics</a>.
              </p>
              <p><strong className="help-parameter">Noise Amplitude</strong>Makes the noise brighter.</p>
              <p><strong className="help-parameter">Equalize Histogram</strong>Applies histogram equalization to the noise.
                This can reveal things but it can also hide them.
                You should try both histogram equalization and scale
                to analyze to noise.
              </p>
              <p><strong className="help-parameter">Magnifier Enhancement</strong>There are three different enhancements available at the moment. <a href="https://en.wikipedia.org/wiki/Histogram_equalization">Histogram Equalization</a>, Auto Contrast and Auto Contrast by Channel. Auto Contrast mostly keeps the colors intact, the others can cause color shifts. Histogram Equalization is the most robost option. You can also set this to none.</p>
              <p><strong className="help-parameter">Opacity</strong>The opacity of the noise layer. If you lower it you will see more of the original image.</p>
              <h2>Level Sweep</h2>
              <p>
                This tool allows you to quicky sweep through the histogram of an image.
                It magnifies the contrast of certain brightness levels.
                On use of this tool is to make edges that were introduced when copy pasting content more visible.
              </p>
              <p>
                To use this tool simple move your mouse over the image and scroll with your mouse wheel.
                Look for interesting discontinuities in the image.
              </p>
              <p>
                A position of 0.5 and a width of 32 would mean that
                127-32/2 would be the equal to 0 in the output. 127+32/2 would be equal to 256.
              </p>
              <p><strong className="help-parameter">Sweep</strong>The position in the histogram to be inspected.
                You can quickly change this parameter by using the mouse wheel while hovering over the image,
                this allows you to sweep through the histogram.
              </p>
              <p><strong className="help-parameter">Width</strong>The amount of values (or width of the slice of the histogram) to be inspected.
                You the default should be fine.
              </p>
              <p><strong className="help-parameter">Opacity</strong>The opacity of the sweep layer. If you lower it you will see more of the original image.</p>
              <h2>Luminance Gradient</h2>
              <p>
                The luminance gradient tool analyses the changes in brightness along the x and y axis of the image.
                It's obvious use is to look at how different parts of the image are illuminated in order to find anomalies.
                Parts of the image which are at a similar angle (to the light source) and under similar illumination should have a similar color;
                Another use is to check edges. Similar edges should have similar gradients.
                If the gradients at one edge are significantly sharpe than the rest it's a sign that the image could have been copy pasted.
                It does also reveal noise and compression artifacts quite well.
              </p>
              <h2>PCA</h2>
              <p>
                This tool performs <a href="https://en.wikipedia.org/wiki/Principal_component_analysis">principal component analysis</a> on the image.
                This provides a different angle to view the image data which makes discovering
                certain manipulations & details easier. This tool is currently single threaded and quite
                <strong>slow</strong> when running on big images.
              </p>
              <p>I have provided an example of how this tool can be used in my short article <a href="https://29a.ch/2016/08/11/principal-component-analysis-for-photo-forensics/">Principal Component Analysis for Photo Forensics</a>.</p>
              <p><strong className="help-parameter">Input</strong>The data to run the PCA on.</p>
              <p><strong className="help-parameter">Mode</strong>
                <ul>
                  <li>Projection: projection of the value in the image onto the principal component.</li>
                  <li>Difference: Difference between the input and the closest point on the selected principal component.</li>
                  <li>Distance: Distance between the input and the closest point on the selected principal component.</li>
                  <li>Component: The closest point on the selected principal component.</li>
                </ul>
              </p>
              <p><strong className="help-parameter">Component</strong>The component of the PCA you want to inspect.
                The first component contains the most variance.
                The later components can reveal more hidden details.
              </p>
              <p><strong className="help-parameter">Linearize</strong>Enables operation in linear space rather than in gamma space. <strong>Slower</strong>.</p>
              <p><strong className="help-parameter">Invert</strong>Inverts the output data.</p>
              <p><strong className="help-parameter">Enhancement</strong>There are three different enhancements available at the moment. <a href="https://en.wikipedia.org/wiki/Histogram_equalization">Histogram Equalization</a>, Auto Contrast and Auto Contrast by Channel. Auto Contrast mostly keeps the colors intact, the others can cause color shifts. Histogram Equalization is the most robost option. You can also set this to none.</p>
              <p><strong className="help-parameter">Opacity</strong>The opacity of the sweep layer. If you lower it you will see more of the original image.</p>
              <h2>Meta Data</h2>
              <p>This tool displays the hidden exif meta data in the image, if there is any.</p>
              <h2>Geo Tags</h2>
              <p>This tool shows the GPS location where the image was taken, if it is stored in the image.</p>
              <h2>Thumbnail Analysis</h2>
              <p>
                This tool shows the hidden preview image inside of the original image if there is one.
                The preview can reveal details of the original image or the camera it was taken with.
              </p>
              <p><strong className="help-parameter">Opacity</strong>
                <span>opacity of the preview image on top of the original image.</span>
              </p>
              <p><strong className="help-parameter">Show Differences</strong>
                <span>enabled this will show the differences between the original image and the preview stored within it.</span>
              </p>
              <h2>C2PA Content Authenticity</h2>
              <p>This tool displays the C2PA content authenticity meta data in the image, if there is any.
                It is built using <a href="https://github.com/contentauth/c2pa-js">c2pa-js</a>.
                In order to protect your privacy, the fetching of remote resources is disabled.
              </p>
              <p>Please consider that even though the meta data is signed it still isn't inherently trustworthy.</p>
              <p>The C2PA tool in forensically is relatively basic. You can use the <a href="https://contentcredentials.org/verify">Verify Tool</a> from contentcredentials.org or the <a href="https://github.com/contentauth/c2pa-rs/tree/main/cli">C2PA command line tool</a> for more information.</p>
              <p>The C2PA requires additional code to run. To save bandwidth, it is only available offline after you've used it at least once.</p>

              <h2>JPEG Analysis</h2>
              <p>This tool extracts meta data out of JPEG Files. You can learn more about it in my post <a href="https://29a.ch/2017/02/05/jpeg-forensics-in-forensically/">JPEG Forensics in Forensically</a>.</p>
              <h4>Comments</h4>
              <p>Some applications store interesting data in the comments of a JPEG file.</p>
              <h4>Quantization Tables</h4>
              <p>
                The <a href="https://en.wikipedia.org/wiki/JPEG#Quantization">quantization matrices</a> used to compress a JPEG file
                reveals information about what software was last used to save the file in question.
              </p>
              <p>Forensically currently recognizes three types of quantization matrices:</p>
              <ul>
                <li>Standard JPEG</li>
                <li>Adobe (latest CC should be complete, the rest is still incomplete)</li>
                <li>Non Standard</li>
              </ul>
              <p>I'm missing a complete set of sample images for older photoshop versions using the 0-12 quality scale. If you happen to have one and would be willing to share it please let me know.</p>
              <p>
                Most software and internet services save their files using the quantization matrices defined by the standard.
                The exception to this rule are Adobe products, which use their own custom quantization tables.
                Jpegs produces by digital cameras often use non standard color matrices.
              </p>
              <p>
                So if you know that the camera that an image was supposedly taken with uses one type of quantization matrix
                and the image you are trying to verify uses a different type of quantization matrix this can be a good indicator
                that the file has been edited or at least resaved.
              </p>
              <p>
                From what I have seen iPhones use non standard quantization tables with qualities around 92.
                Android phones tend to use the standard quantization matrices, but there are exceptions to this.
              </p>
              <p>
                For more information about this technique please look at the presentation
                <a href="https://dfrws.org/sites/default/files/session-files/pres-using_jpeg_quantization_tables_to_identify_imagery_processed_by_software.pdf">
                  Using JPEG Quantization Tables to Identify Imagery Processed by Software</a>
                by Jesse Kornblum.
              </p>
              <h4>Structure</h4>
              <p>
                The sequence of <a href="https://en.wikipedia.org/wiki/JPEG#Syntax_and_structure">markers in a JPEG</a> file.
                In general JPEG images taken with a camera with the same settings should result in the same sequence.
              </p>
              <h2>String Extraction</h2>
              <p>

                This tool scans for binary contents of the image looking for sequences of ascii characters.
                It is a great fallback to view meta data that is in an image in a format that Forensically does not understand yet.
                It will output sequences of alpha numeric characters longer than 4, or sequences of 8 or more non control ascii characters.
                This allows you to discover meta data that is hidden or not recognized by forensically.
                The relevant data is genreally stored at the beginning or end of the file.
              </p>
              <p>
                An interesting string to look for is bFBMD followed by a sequence of numbers and letters a-f (hex encoding).
                This string is added to (some) images by facebook.
              </p>
              <p>It is inspired by the classic unix <a href="https://en.wikipedia.org/wiki/Strings_(Unix)">strings</a> command. </p>
              <p>You can find some more information about how to use this tool in my post <a href="https://29a.ch/2017/02/05/jpeg-forensics-in-forensically/">JPEG Forensics in Forensically</a>.</p>

              <h2>FAQ</h2>
              <p className="faq-question">Are my images uploaded to your server?</p>
              <p className="faq-answer">No! I respect your privacy. All of your images stay on your computer. They are never uploaded to any cloud or server.</p>

              <p className="faq-question">Can I open <em>RAW</em> images using this app?</p>
              <p className="faq-answer">
                No, RAW images are not supported. The highest
                quality format you can use is 24-bit PNG.
              </p>

              <p className="faq-question">Can I use this app offline?</p>
              <p className="faq-answer">Yes you can if you are using a modern web browser like firefox or chrome.<br /><span className="offline-available hidden"><strong>Offline mode is enabled. You can open this application even if you are offline.</strong></span><span className="offline-unavailable"><strong>Offline mode is not working with your current setup.</strong></span></p>

              <p className="faq-question">What other similar software can you recommend?</p>
              <p className="faq-answer"><a href="http://www.getghiro.org/">Ghiro</a> looks pretty cool and is open source. You can try it online on <a href="http://www.imageforensic.org/">imageforensic.org</a>.</p>

              <h2>Changelog</h2>
              <h3>2024-04-12</h3>
              <p>Added C2PA tool for displaying C2PA JUMBF content authenticity meta data.</p>
              <h3>2025-03-29</h3>
              <p>Modernized some of the dependencies and improved performance.</p>
              <h3>2017-06-14</h3>
              <p>Fixed a typo in the JPEG module which recognized progressive JPEGs as lossless. Updated help page.</p>
              <h3>2017-02-05</h3>
              <p>Added JPEG Analysis and String Extraction tools. See <a href="https://29a.ch/2017/02/05/jpeg-forensics-in-forensically/">JPEG Forensics in Forensically</a>.</p>
              <h3>2016-07-14</h3>
              <p>Added PCA tool.</p>
              <h3>2016-07-02</h3>
              <p>Added luminance gradient tool. Tweaked clone detection default settings.</p>
              <h3>2016-06-30</h3>
              <p>Added offline support for modern browsers via service workers.</p>
              <h3>2015-08-21</h3>
              <p>Added noise analysis tool.</p>
              <h3>2015-08-20</h3>
              <p>Added a new enhancement option to the magnifier (histogram equalization). Added magnifier to Error Level Analysis.</p>
              <h3>2015-08-16</h3>
              <p>Initial Public release</p>
              <h2>Credits</h2>
              <h3>Clone Detection</h3>
              <p>The clone detection tool was inspired by the paper <a href="http://www.ws.binghamton.edu/fridrich/Research/copymove.pdf">Detection of Copy-Move Forgery in Digital Images</a> by Jessica Fridrich, David Soukal, and Jan Lukas. But the actual algorithm used is my own.</p>
              <h3>Error Level Analysis</h3>
              <p>I got the concept out of the presentation <a href="http://www.hackerfactor.com/papers/bh-usa-07-krawetz-wp.pdf">A Picture's Worth... Digital Image Analysis and Forensics</a> by Neal Krawetz</p>
              <h3>Luminance gradient</h3>
              <p>This is another tecnique inspired by <a href="http://www.hackerfactor.com/">Neal Krawetz</a></p>
              <h3>Open Source Libraries</h3>
              <p>
                This software was built using the following open source components.
                I want to thank all of their authors for making my life easier, and projects like this possible.
                You can find their respective licenses on the pages linked below.
              </p>
              <ul id="help-dependencies">
              </ul>
              <div className="action">
                <div className="button dialog-close-action">Close</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
