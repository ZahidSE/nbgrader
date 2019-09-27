function ShortAnswerGrader(api_url) {
    this.api_url = api_url;
}

ShortAnswerGrader.prototype.init = function(){
    var self = this;
    $("div[data-solution-id]").each(function(index, element){
        if(index ==0 ) {
            self.$ref_element = $(element);
            self.$answer_element = self.$ref_element.parent().next().find(".panel-body .rendered_html");
            self.$question_element =  self.$ref_element.parent().parent().parent().prev().find(".inner_cell .rendered_html");

            self.create_mock_elements();
            self.highlight_max_similar_phrase_pairs();
        }
    });
}

ShortAnswerGrader.prototype.create_mock_elements = function() {
    var self = this;
    var elements = [self.$question_element, self.$ref_element, self.$answer_element];
    var mock_elements = [];

    $.each(elements, function(_, value) {
        $element = value;
        var element_text = $element.text().trim().replace(/\u00B6/g, "");;
        var $mock_element = $($element.prop('outerHTML'));

        $mock_element.empty();
        $mock_element.attr("data-text", element_text);

        $.each(element_text.split(" "), function(_, value){
            $mock_element.append($('<span class="word" data-text=">' + value + '">' + value.replace('_', ' ') + '</span>'));
        });

        mock_elements.push($mock_element);

        $element.parent().append($mock_element);

        $element.addClass("hidden");
    });

    self.$question_element = mock_elements[0];
    self.$ref_element = mock_elements[1];
    self.$answer_element = mock_elements[2];

    self.$question_element.addClass("question-text");
}

ShortAnswerGrader.prototype.highlight_max_similar_phrase_pairs = function() {
    data = {
        task: {
            cells: ["Hi"]
        },
        solution: {
            cells: ["There"]
        }
    };

    $.ajax({
        url: this.api_url,
        dataType: 'json',
        type: 'post',
        contentType: 'application/json',
        data: JSON.stringify(data),
        processData: false,
        success: function( data, textStatus, jQxhr ){
            console.log(data);
        },
        error: function( jqXhr, textStatus, errorThrown ){
            console.log( "An error occurred while getting similarity from API:" + errorThrown );
        }
    });
}

$(window).load(function () {
    var grader = new ShortAnswerGrader("/grader/api/short-answer");
    grader.init();
});